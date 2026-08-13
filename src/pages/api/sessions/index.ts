import type { APIRoute } from "astro";
import { listSessions } from "../../../lib/db.ts";

export const GET: APIRoute = () => Response.json(listSessions());
