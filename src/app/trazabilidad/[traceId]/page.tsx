import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TraceReader } from "@/components/trace-reader";
import { getPublicOrigin } from "@/server/public-origin";
import { publicTraceReader } from "@/server/traces/queries";
import { ApplicationError } from "@/server/application-error";

export const metadata: Metadata = {
  title: "Consulta de trazabilidad",
  robots: { index: false, follow: false },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TracePage({ params }: { params: Promise<{ traceId: string }> }) {
  const rawId = (await params).traceId;
  const parsed = z.uuid().safeParse(rawId);
  if (!parsed.success) notFound();
  const traceId = parsed.data.toLowerCase();

  const headerList = await headers();
  const cachedHeader = headerList.get("x-jopoi-trace-payload");
  let initialTrace;
  if (cachedHeader) {
    try {
      initialTrace = JSON.parse(Buffer.from(cachedHeader, "base64").toString("utf-8"));
    } catch {
      initialTrace = await publicTraceReader().getTrace(traceId);
    }
  } else {
    try {
      initialTrace = await publicTraceReader().getTrace(traceId);
    } catch (error) {
      if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
        notFound();
      }
      throw error;
    }
  }

  return (
    <div className="stack">
      <h1>Consulta de trazabilidad</h1>
      <p>Una lectura pública del recorrido y su evidencia. Este enlace no otorga permisos de operación.</p>
      <p className="muted identifier">Recorrido: {traceId}</p>
      <noscript>
        La consulta interactiva requiere JavaScript para contrastar hitos con testnet y generar el código QR. El
        historial, los datos del recorrido y los enlaces textuales están disponibles directamente en esta página.
      </noscript>
      <TraceReader traceId={traceId} initialTrace={initialTrace} publicOrigin={getPublicOrigin()} />
    </div>
  );
}
