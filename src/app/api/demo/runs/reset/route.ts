import { postRunIntent } from "@/server/sessions/http";

export const runtime = "nodejs";
export const POST = postRunIntent("RESET");
