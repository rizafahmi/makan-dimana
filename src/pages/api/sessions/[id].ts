import type { APIRoute } from "astro";
import { getSession } from "../../../lib/db.ts";

export const GET: APIRoute = ({ params }) => {
  const session = getSession(params.id ?? "");
  if (session === undefined) return new Response(null, { status: 404 });
  return Response.json(session);
};
