import type { Metadata } from "next";
import { DemoReader } from "@/components/demo-reader";
import { Notice } from "@/components/ui/primitives";
export const metadata: Metadata = { title: "Demo", robots: { index: false, follow: false } };
export default function DemoPage() {
  return <div className="stack"><h1>Tu recorrido de demostración</h1>
    <p>Un lote, un comprador y un viaje. Esta consulta recupera lo que ya está guardado en tu sesión, sin crear otra exploración.</p>
    <Notice title="Por ahora, una vista de consulta"><p>Los controles para iniciar, editar y completar el recorrido se habilitarán en una etapa posterior. Esta versión no realiza acciones operativas.</p></Notice>
    <DemoReader />
  </div>;
}
