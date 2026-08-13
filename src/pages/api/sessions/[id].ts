import type { APIRoute } from "astro";
import {
  getSession,
  normalizeSessionId,
  recordVote,
  setSessionOpen,
} from "../../../lib/db.ts";
import { readForm } from "../../../lib/form.ts";

const voteActions = ["upvote", "downvote"];
const sessionActions = ["close", "reopen"];
const allowedPlaces = ["1", "2", "3", "4"];
const failureStatus = { not_found: 404, no_such_place: 400, closed: 409 };

const apply = (id: string, form: FormData) => {
  const action = form.get("action");
  const place = form.get("place");

  if (typeof action !== "string") return null;
  if (sessionActions.includes(action)) {
    return setSessionOpen(id, action === "reopen");
  }
  if (!voteActions.includes(action)) return null;
  if (typeof place !== "string" || !allowedPlaces.includes(place)) return null;
  return recordVote(id, Number(place), action === "downvote" ? -1 : 1);
};

export const GET: APIRoute = ({ params }) => {
  const session = getSession(params.id ?? "");
  if (session === undefined) return new Response(null, { status: 404 });
  return Response.json(session);
};

export const POST: APIRoute = async ({ params, request }) => {
  const id = normalizeSessionId(params.id ?? "");
  if (id === null) return new Response(null, { status: 404 });

  const form = await readForm(request);
  if (form === null) return new Response(null, { status: 400 });

  const result = apply(id, form);
  if (result === null) return new Response(null, { status: 400 });
  if (!result.ok) {
    return new Response(null, { status: failureStatus[result.reason] });
  }
  return Response.json(getSession(id));
};
