import { TraceLocator } from "@/components/trace-locator";
import { ActionLink } from "@/components/ui/primitives";
export default function HomePage() {
  return <>
    <section className="intro stack"><h1>Materiales y transporte, en una misma operación.</h1>
      <p>Jopói explora cómo conectar un lote de chips forestales con un comprador y un viaje compatible en Corrientes.</p>
      <p>Es un prototipo personal con empresas, rutas e importes ilustrativos. El objetivo es explicar la coordinación y sus registros, sin presentar una operación comercial real.</p>
      <div className="actions"><ActionLink href="/demo">Abrir demo</ActionLink><ActionLink href="#consultar-trazabilidad" secondary>Consultar un recorrido</ActionLink></div>
    </section>
    <section id="consultar-trazabilidad" className="content-section stack"><h2>Consultar trazabilidad</h2><p>Si te compartieron un identificador, podés consultar el recorrido sin cuenta y sin convertirte en su propietario.</p><TraceLocator /></section>
    <section id="book-a-demo" className="content-section stack"><h2>Book a demo</h2><p>Una demostración acompañada para conocer el prototipo y conversar sobre su funcionamiento.</p><p className="muted">El formulario de solicitud todavía no está habilitado en esta versión. No se reservan horarios ni se envían correos.</p></section>
  </>;
}
