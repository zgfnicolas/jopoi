"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ActionButton, Field } from "./ui/primitives";
export function TraceLocator() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const input = useRef<HTMLInputElement>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = z.uuid().safeParse(value.trim());
    if (!parsed.success) { setError("Ingresá el identificador UUID completo del recorrido."); input.current?.focus(); return; }
    setError(undefined);
    router.push(`/trazabilidad/${parsed.data.toLowerCase()}`);
  }
  return <form onSubmit={submit} noValidate className="stack">
    <noscript>Para abrir un recorrido por identificador, activá JavaScript. Los enlaces completos de trazabilidad siguen disponibles para consultar su explicación.</noscript>
    <Field ref={input} id="trace-id" name="traceId" label="Identificador del recorrido" disabled={!ready} value={value} onChange={event => setValue(event.target.value)}
      help="Usá el UUID de un recorrido compartido. Consultarlo no da permiso para modificarlo." error={error} autoComplete="off" spellCheck={false} />
    <div><ActionButton type="submit" disabled={!ready}>Consultar recorrido</ActionButton></div>
  </form>;
}
