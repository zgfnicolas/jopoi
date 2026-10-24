import type { Metadata } from "next";
import { OperationPanel } from "@/components/operation-panel";
import { getPublicOrigin } from "@/server/public-origin";
export const metadata: Metadata = { title: "Demo", robots: { index: false, follow: false } };
export default function DemoPage() {
  return <div className="stack"><h1>Tu recorrido de demostración</h1>
    <p>Un lote, un comprador y un viaje. Representá cada participante y completá una entrega, un rechazo o una incidencia con datos ficticios.</p>
    <noscript>La demo interactiva requiere JavaScript para recuperar tu sesión y enviar las acciones. La landing y la explicación del caso siguen disponibles desde Inicio.</noscript>
    <OperationPanel publicOrigin={getPublicOrigin()} />
  </div>;
}
