# Deploying the relay

One VM in Jakarta behind Caddy, serving <https://vote.rizafahmi.com> from `main`.
This file records what is deployed, why it is shaped this way, and how to remove
every billable trace of it.

## Why it is shaped this way

Three facts in the code decide the whole deployment.

- `src/lib/relay.ts` keeps its subscriber registry in memory, so **exactly one process
  serves the app**. Two instances and a device subscribed to one never hears about a
  write to the other. No autoscaler, no managed instance group, no Cloud Run.
- `src/lib/db.ts` opens a local SQLite file with `journal_mode = DELETE` and holds one
  connection, so the box needs a real disk. Not object storage, not a network mount.
- `/api/sessions/[id]/events` holds a stream open, so nothing in front of it may buffer
  responses or cut idle connections. A GCP HTTPS load balancer severs these at its
  default 30s backend timeout, which is why there is no load balancer here.

And one fact that removes pressure: the relay is not the system of record. Every device
holds a complete copy and `mergeDocs` rebuilds state from whatever documents arrive, so
the server going away is not an outage and its disk being wiped is not data loss. There
is deliberately no replication, no failover and no backup schedule.

TLS is not optional. Service workers only register on a secure origin, so over plain
HTTP the offline behaviour this branch exists to demonstrate simply does not happen.

## Resources

| Where | What |
| :---- | :--- |
| GCP project | `makan-dimana-talk`, created for this so teardown is one command |
| Static IP | `makan-ip`, `asia-southeast2`, `34.101.64.94` |
| VM | `makan`, `asia-southeast2-a`, `e2-small`, Debian 13, 20GB `pd-balanced` |
| Firewall | `allow-web`, tcp:80 and tcp:443, scoped to the `http-server`/`https-server` tags |
| DNS | Cloudflare A record `vote` on `rizafahmi.com`, **DNS only, grey cloud** |

The Cloudflare proxy is deliberately off. It caches `.js` by extension, which includes
`/sw.js`, and a stale service worker cached at the edge breaks the whole room at once
with nothing you can do from the stage.

## First deploy

Project, billing and the Compute API:

```
gcloud projects create makan-dimana-talk --name="Makan Dimana"
gcloud billing projects link makan-dimana-talk --billing-account=<ACCOUNT_ID>
gcloud config set project makan-dimana-talk
gcloud services enable compute.googleapis.com
```

Address first, because DNS needs it and wants time to propagate:

```
gcloud compute addresses create makan-ip --region=asia-southeast2
gcloud compute addresses describe makan-ip --region=asia-southeast2 --format="value(address)"
```

Add the Cloudflare A record now, then confirm it resolves to the GCE address and not to
Cloudflare's anycast range:

```
dig +short vote.rizafahmi.com
```

The machine and its firewall rule:

```
gcloud compute instances create makan \
  --zone=asia-southeast2-a \
  --machine-type=e2-small \
  --image-family=debian-13 --image-project=debian-cloud \
  --boot-disk-size=20GB --boot-disk-type=pd-balanced \
  --address=makan-ip \
  --tags=http-server,https-server

gcloud compute firewall-rules create allow-web \
  --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server \
  --source-ranges=0.0.0.0/0
```

Port 80 is needed even though the app is HTTPS-only, for the ACME challenge and the
redirect.

On the box - Node 24 is the floor, because `node:sqlite` and type stripping are both
unflagged only from there:

```
gcloud compute ssh makan --zone=asia-southeast2-a

curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo corepack enable

sudo useradd --system --home /srv/makan --shell /usr/sbin/nologin makan
sudo mkdir -p /srv/makan
sudo chown makan:makan /srv/makan

sudo -u makan -H git clone https://github.com/rizafahmi/makan-dimana.git /srv/makan
sudo -u makan -H sh -c 'cd /srv/makan && pnpm install --frozen-lockfile'
sudo -u makan -H sh -c 'cd /srv/makan && pnpm build'
```

Both the `-H` and the `cd` inside `sh -c` are load-bearing. Debian's sudoers does not
reset `HOME` for `-u`, and `sudo` keeps the calling shell's working directory, so
without them corepack walks up from your home directory and dies on `EACCES` reading a
`package.json` the service user cannot see.

`/etc/systemd/system/makan.service`:

```
[Unit]
Description=Makan Dimana relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=makan
WorkingDirectory=/srv/makan
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=4321
Environment=MAKAN_DB=/var/lib/makan/makan.db
ExecStart=/usr/bin/node ./dist/server/entry.mjs
Restart=always
RestartSec=2
StateDirectory=makan
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`StateDirectory=makan` is what makes `/var/lib/makan` writable despite
`ProtectSystem=strict`. `HOST=127.0.0.1` binds loopback only, so the app is reachable
solely through the HTTPS origin and never over the plain-HTTP path where the service
worker silently refuses to register.

```
sudo systemctl daemon-reload
sudo systemctl enable --now makan
```

`/etc/caddy/Caddyfile`:

```
vote.rizafahmi.com {
	reverse_proxy 127.0.0.1:4321 {
		flush_interval -1
	}
}
```

```
sudo systemctl reload caddy
```

`flush_interval -1` disables response buffering. Caddy already detects
`text/event-stream` and the endpoint sets `x-accel-buffering: no`, so this is
belt-and-braces - but a buffered stream is a miserable thing to diagnose at a venue.

## Checks that matter

An empty `/var/lib/makan` after boot is expected, not a fault. Astro loads routes
lazily and `/` is a data-free shell, so nothing imports `src/lib/db.ts` until a request
reaches the relay:

```
curl -s https://vote.rizafahmi.com/api/sessions/abc1234
```

That returns `[]` and creates the file. Getting `[]` rather than a 500 is also what
proves the `PRAGMA journal_mode = DELETE` assertion passed.

The stream must arrive unbuffered, with `event: ready` instantly and a `: beat` every
15 seconds:

```
curl -N -s --max-time 70 https://vote.rizafahmi.com/api/sessions/abc1234/events
```

And the one that decides whether the talk works:

```
curl -s https://vote.rizafahmi.com/s/abc1234 | grep -oE 'https?://[^"<> ]+/s/abc1234' | sort -u
```

It must print `https://vote.rizafahmi.com/s/abc1234`. If it prints `localhost:4321`,
the production hostname is missing from `security.allowedDomains` in
`astro.config.mjs`, `Astro.url` has fallen back to the socket, and the QR code on the
board points at nowhere. See `docs/talk.md` for the full shape of that trap.

Finally, on a real phone over cellular: load the site, load it a **second** time so the
worker controls the page, then go offline and reload.

Anything that is not a browser must send an `Origin` header on a POST. Astro's
`checkOrigin` answers a form POST without one with 403 `Cross-site POST form
submissions are forbidden`, and nothing in the app says so - a monitoring probe or a
load generator that writes to the relay looks like a silent failure until you read the
status code. `docs/talk.md` records the same trap in its Tailscale form.

## Measured capacity

Eighty simulated devices casting two votes each over five minutes, run on the box
itself - the shape of a talk, not a stress test. The load generator shared the same two
vCPUs as the server, so these are a floor rather than a ceiling.

| | before `coalesce.ts` | after |
| :-- | --: | --: |
| requests | 39,201 | 26,041 |
| push p50 / p95 | 78ms / 13,532ms | 51ms / 108ms |
| pull p50 / p95 | 90ms / 14,758ms | 71ms / 136ms |
| failures | 274 | 0 |

The tail was the problem, not the median. Every device's first push is a new row and so
a real publish, which means eighty people opening the session at once produce eighty
publishes and eighty exchanges each - roughly 12,800 requests in a few seconds. Before
the in-flight guard those exchanges overlapped and queued, turning a 90ms pull into a
fifteen-second one. Collapsing them removed the queue without removing any publishes:
nudges per device held at 238 against 243 expected.

The box was never the constraint. CPU peaked near 30% in every run, including the ones
that failed a fifth of their requests.

## Redeploying

```
sudo -u makan -H sh -c 'cd /srv/makan && git pull && pnpm install --frozen-lockfile && pnpm build'
sudo systemctl restart makan
```

Or directly use gcloud

```
gcloud compute ssh makan --zone=asia-southeast2-a --command="sudo -u makan -H sh -c 'cd /srv/makan && git pull && pnpm install --frozen-lockfile && pnpm build' && sudo systemctl restart makan"
```

Bump the `version` constant in `public/sw.js` in the same commit as anything the shell
ships, or one visitor keeps a stale cache and nobody else can reproduce it.

There is one machine, so a restart is a few seconds of the relay being unreachable.
Devices keep rendering, voting and closing throughout, and converge on the next sync.

## Tearing it down

Deleting the project removes the VM, its boot disk, the address and the firewall rule
in one action, and is the only version of this with nothing left to forget:

```
gcloud projects delete makan-dimana-talk
```

Then delete the `vote` A record in Cloudflare.

To keep the project and remove only the deployment:

```
gcloud compute instances delete makan --zone=asia-southeast2-a
gcloud compute addresses delete makan-ip --region=asia-southeast2
gcloud compute firewall-rules delete allow-web
```

The boot disk auto-deletes with the instance. Confirm nothing survives:

```
gcloud compute instances list
gcloud compute addresses list
gcloud compute disks list
```

All three must come back empty. To stop charges immediately without deleting anything,
unlink billing instead:

```
gcloud billing projects unlink makan-dimana-talk
```

### What still bills after you think you are done

- **A reserved static IP that is not attached to a running VM.** Attached to a running
  instance it is free; unattached, or attached to a *stopped* one, it bills around
  $7/month indefinitely. This is the single most commonly forgotten GCP resource and
  the reason `gcloud compute addresses list` is in the checks above.
- **Boot disks.** They survive if you delete an instance with disk auto-delete turned
  off, at roughly $2/month for 20GB.
- **Stopping the VM is not teardown.** `gcloud compute instances stop` ends compute
  charges but keeps the disk billing and detaches the address into its paid state, so
  it can cost more per month than leaving the machine running.

Nothing of value is lost by tearing this down. Every device holds a complete copy of
every session it knows, so the sessions survive on the phones that voted in them, and
the relay's SQLite file only ever held copies.
