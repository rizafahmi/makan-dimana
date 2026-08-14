import type { APIRoute } from "astro";
import { listDocs, putDoc } from "../../../lib/db.ts";
import { normalizeSessionId } from "../../../lib/id.ts";
import { readForm } from "../../../lib/form.ts";

const fail = (error: string, status: number) =>
  Response.json({ error }, { status });

export const GET: APIRoute = ({ params }) => {
  const id = normalizeSessionId(params.id ?? "");
  if (id === null) return fail("not_found", 404);
  return Response.json(listDocs(id));
};

export const POST: APIRoute = async ({ params, request }) => {
  const id = normalizeSessionId(params.id ?? "");
  if (id === null) return fail("not_found", 404);

  const form = await readForm(request);
  if (form === null) return fail("bad_request", 400);

  const device = form.get("device");
  const doc = form.get("doc");
  if (typeof device !== "string" || typeof doc !== "string") {
    return fail("bad_request", 400);
  }

  putDoc(id, device, doc);
  return new Response(null, { status: 204 });
};
