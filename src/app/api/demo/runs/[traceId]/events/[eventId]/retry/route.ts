import { retryPublicationHttp } from "@/server/hedera/retry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = retryPublicationHttp;
