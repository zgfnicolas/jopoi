import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TraceReader } from "@/components/trace-reader";
export const metadata: Metadata = { title: "Consulta de trazabilidad", robots: { index: false, follow: false } };
export default async function TracePage({ params }: { params: Promise<{ traceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).traceId);
  if (!parsed.success) notFound();
  return <div className="stack"><h1>Consulta de trazabilidad</h1><p>Una lectura pública del recorrido y sus estados guardados. Este enlace no otorga permisos de operación.</p><p className="muted identifier">Recorrido: {parsed.data.toLowerCase()}</p><TraceReader traceId={parsed.data.toLowerCase()} /></div>;
}
