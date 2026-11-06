import { getOperationHttp, patchOperationHttp } from "@/server/operations/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = getOperationHttp;
export const PATCH = patchOperationHttp;
