import { deleteSession, getSession, postSession } from "@/server/sessions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = getSession;
export const POST = postSession;
export const DELETE = deleteSession;
