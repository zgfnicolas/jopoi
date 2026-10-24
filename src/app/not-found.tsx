import { ActionLink } from "@/components/ui/primitives";
export default function NotFound() {
  return <div className="stack"><h1>El enlace no está disponible</h1><p>Revisá la dirección. Si querés consultar trazabilidad, necesitás un identificador UUID válido.</p><div><ActionLink href="/#consultar-trazabilidad">Consultar otro recorrido</ActionLink></div></div>;
}
