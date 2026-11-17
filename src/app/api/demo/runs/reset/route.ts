import { postRunIntent } from "@/server/sessions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = postRunIntent("RESET");
