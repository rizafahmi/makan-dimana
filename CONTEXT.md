# Makan Dimana

A group creates a vote session for food places, shares the link, and votes.
Every device holds its own complete copy; the server carries copies between
them. There are no accounts - a device is the closest thing to a person.

## Language

**Vote session**:
One decision about where a group will eat, with two to four places to choose between.
_Avoid_: poll, room, event, vote

**Place**:
A candidate for the group to eat at. Named once at creation and never edited.
_Avoid_: option, restaurant, candidate, choice

**Slot**:
One of the four fixed positions a place can occupy in a session. A session always
has slots 1 and 2; slots 3 and 4 may be unused.
_Avoid_: index, position, column

**Vote**:
A single increment one device contributes to one place. A device may vote as many
times as it likes, and may take a vote back.
_Avoid_: like, point, ballot

**Tally**:
The count for a place once every device's votes are combined. May be negative when
devices independently take back votes they could not see each other cast.
_Avoid_: score, count, total

**Winner**:
The place holding the highest tally in a closed session. Two or more places sharing
the highest tally are all winners, and the session is a **tie**.
_Avoid_: result, top place

**Closed**:
A session that has been ended and now shows its winner. Closing is permanent - once
any device closes a session it is closed for everyone, forever.
_Avoid_: locked, finished, archived, ended

**Device**:
The unit of identity. There are no users or accounts, so a device is who votes, who
creates, and who closes. Two browsers on one machine are two devices.
_Avoid_: user, voter, client, account, person

**Creator**:
The device that made a session. The only source of that session's title and place
names; every other device just carries them.
_Avoid_: owner, host, admin

**Local list**:
The sessions one device knows about - the ones it created or opened. This is what
the landing page shows. There is no list of all sessions anywhere.
_Avoid_: feed, public list, all sessions, index

**Share link**:
The URL for a session, and the only way a device learns a session exists.
_Avoid_: invite, permalink

**Sync**:
Handing this device's copy to the server and taking back every other device's copy.
_Avoid_: refresh, save, upload, update
