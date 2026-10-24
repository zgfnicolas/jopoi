import Image from "next/image";
import chipsPhoto from "../../public/demo/chips-v1/chips-pile.jpg";
import { DemoRequestForm } from "@/components/demo-request-form";
import { TraceLocator } from "@/components/trace-locator";
import { ActionLink } from "@/components/ui/primitives";
import { createScenarioSnapshot } from "@/domain/scenario";
import { calculateEconomics } from "@/domain/economics";
import { formatArs, formatKg, formatHumidity, formatDecimal } from "@/frontend/format";
import styles from "./page.module.css";

export default function HomePage() {
  const scenario = createScenarioSnapshot();
  const result = calculateEconomics(scenario.initialLot.quantityKg, scenario.pricing);
  if (!result.ok) throw new Error("El escenario de la landing no permite calcular sus importes.");
  const economics = result.value;
  const photo = scenario.assets.find(asset => asset.id === "chips-pile");
  if (!photo?.sourceUrl || !photo.licenseUrl) throw new Error("Falta la atribución de la fotografía del escenario.");
  return <>
    <section className={styles.opening} aria-labelledby="landing-title">
      <div className={styles.heading}>
        <h1 id="landing-title">Un lote disponible.<br />Un retorno que puede llevarlo.</h1>
        <p className={styles.lead}>Chips forestales en Santa Rosa, Corrientes. Jopói conecta material, comprador y transporte compatible en un mismo recorrido. Probá cómo se coordina una operación y qué registro deja cada paso.</p>
        <div className="actions"><ActionLink href="/demo">Probar demo <span aria-hidden="true">↗</span></ActionLink><ActionLink href="#book-a-demo" secondary>Book a demo</ActionLink></div>
        <p className={styles.caption}>Sin cuenta. Un escenario ficticio para explorar el prototipo.</p>
      </div>
      <figure className={styles.photo}>
        <Image src={chipsPhoto} alt={photo.alt} sizes="(max-width: 48rem) calc(100vw - 2rem), (max-width: 75rem) 45vw, 32rem" preload />
        <figcaption>Material de referencia · No es una carga real de Jopói.</figcaption>
      </figure>
      <div className={styles.case}>
        <div><h2>{scenario.material.label}</h2><p>{formatKg(scenario.initialLot.quantityKg)} a granel · Humedad de ejemplo {formatHumidity(scenario.initialLot.humidityPercent)}</p></div>
        <div className={styles.comparison}><span>Diferencia ilustrativa a favor del retorno</span><strong>{formatArs(economics.difference)}</strong><span>frente al flete dedicado, con los supuestos de abajo</span></div>
      </div>
    </section>
    <section className={`content-section ${styles.economics}`} aria-labelledby="economics-title">
      <div className="stack"><h2 id="economics-title">Aprovechar un retorno cambia la cuenta.</h2><p>El ejemplo conecta un lote con un viaje que ya tiene un retorno disponible. Se compara la misma cantidad de material con dos alternativas de transporte.</p><p>{scenario.route.label}. Distancia supuesta: {formatDecimal(scenario.route.distanceKm)} km. No representa una ruta contratada.</p><p className={styles.caption}>{economics.disclaimer} La coordinación es un cargo supuesto; no define el modelo comercial definitivo.</p></div>
      <div className={styles.ledger}><dl>
        <div><dt>Material · {formatArs(scenario.pricing.materialPerTonne)} / t</dt><dd>{formatArs(economics.materialCost)}</dd></div>
        <div><dt>Flete de retorno</dt><dd>{formatArs(economics.returnFreight)}</dd></div>
        <div><dt>Coordinación de ejemplo</dt><dd>{formatArs(economics.jopoiFee)}</dd></div>
        <div className={styles.total}><dt>Total con retorno</dt><dd>{formatArs(economics.jopoiTotal)}</dd></div>
        <div><dt>Total con flete dedicado</dt><dd>{formatArs(economics.alternativeTotal)}</dd></div>
      </dl><p className={styles.caption}>Alternativa: mismo material + {formatArs(economics.dedicatedFreight)} de flete dedicado. Todos los importes están expresados en ARS.</p></div>
    </section>
    <section className="content-section stack" aria-labelledby="roles-title"><h2 id="roles-title">Cada participante aporta una parte.</h2>
      <dl className={styles.roles}><div><dt>Generador</dt><dd>Declara el lote, su cantidad y sus características.</dd></div><div><dt>Comprador</dt><dd>Revisa el material y sus requisitos de recepción.</dd></div><div><dt>Transportista</dt><dd>Aporta el viaje, la capacidad y la ventana de retiro.</dd></div><div><dt>Coordinador Jopói</dt><dd>Relaciona el lote, la demanda y un viaje compatible.</dd></div></dl>
      <p className={styles.caption}>Empresas y roles simulados. Cambiar de rol explica la operación; no representa la firma independiente de una empresa real.</p>
    </section>
    <section className={`content-section ${styles.process}`} aria-labelledby="process-title"><div className="stack"><h2 id="process-title">Un recorrido que también contempla lo que falla.</h2><p>Un lote, un comprador y un viaje por operación. La demo mantiene ese límite para hacer visible cada decisión.</p></div>
      <ol className={styles.steps}><li><strong>Declarar y contrastar</strong><p>Registrar el lote y revisar los requisitos del comprador.</p></li><li><strong>Elegir un viaje compatible</strong><p>Contrastar capacidad, carrocería, ruta y horario antes de asignar.</p></li><li><strong>Confirmar retiro y entrega</strong><p>Son acciones separadas. Consultar un QR no confirma ninguna de ellas.</p></li><li><strong>Resolver la recepción</strong><p>Aceptar el material, rechazarlo o registrar una incidencia con su motivo.</p></li></ol>
    </section>
    <section className={`content-section ${styles.record}`} aria-labelledby="record-title"><div className="stack"><h2 id="record-title">La acción y su evidencia, conectadas.</h2></div><div className="stack"><p>PostgreSQL conserva las acciones de la demo. Los hitos operativos generan eventos cuyo hash se envía a Hedera testnet; navegar o guardar un borrador no genera una transacción.</p><p>La trazabilidad permite consultar el historial y contrastar su hash con el registro de red. Un envío pendiente sigue pendiente hasta obtener una confirmación real.</p><p className={styles.caption}>Testnet es una red de pruebas. El registro no certifica la carga física, su calidad ni un resultado comercial. La operación sin conexión completa queda para una evolución posterior.</p></div></section>
    <section id="book-a-demo" className={`content-section ${styles.contact}`} aria-labelledby="contact-title"><div className="stack"><h2 id="contact-title">Book a demo</h2><p>Dejá tus datos para solicitar conocer Jopói en una demostración acompañada.</p><p className={styles.caption}>Este formulario guarda una solicitud real. No reserva una fecha ni envía correos automáticos.</p></div><DemoRequestForm /></section>
    <section id="consultar-trazabilidad" className="content-section stack"><h2>¿Ya tenés un identificador de trazabilidad?</h2><p>Consultá el recorrido sin cuenta. Conocer un identificador no permite modificar la operación.</p><TraceLocator /></section>
    <details className={styles.credits}><summary>Fotografía y licencia</summary><p>{photo.attribution} <a href={photo.sourceUrl}>Ver fuente</a> · <a href={photo.licenseUrl}>{photo.license}</a>. Encuadre de presentación mediante CSS.</p><p>{photo.caption}</p></details>
  </>;
}
