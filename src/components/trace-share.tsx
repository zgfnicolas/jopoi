"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ActionButton, ActionLink } from "./ui/primitives";
import styles from "./trace-share.module.css";

function shareUrl(path: string | null, origin: string | null): string | null {
  if (!path || !origin) return null;
  try {
    const url = new URL(origin);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.origin === origin && !url.username && !url.password && (url.protocol === "https:" || local) ? new URL(path, origin).href : null;
  } catch { return null; }
}

export function TraceShare({ traceId, expiresAt, publicOrigin }: { traceId: string; expiresAt: string; publicOrigin: string | null }) {
  const [image, setImage] = useState<{ url: string; png: string } | null>(null), [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false), [copy, setCopy] = useState<{ url: string; message: string } | null>(null);
  const parsed = z.uuid().safeParse(traceId);
  const path = parsed.success ? `/trazabilidad/${parsed.data.toLowerCase()}` : null;
  const url = shareUrl(path, publicOrigin);
  const deadline = Date.parse(expiresAt);
  const unavailable = expired || !Number.isFinite(deadline) || deadline <= Date.now();
  useEffect(() => {
    setExpired(false); setImage(null); setCopy(null); setFailed(false);
    const check = () => { if (Date.now() >= deadline || !Number.isFinite(deadline)) { setExpired(true); setImage(null); setCopy(null); } };
    check();
    const timer = setTimeout(check, Math.min(2147483647, Math.max(0, deadline - Date.now())));
    window.addEventListener("pageshow", check); document.addEventListener("visibilitychange", check);
    return () => { clearTimeout(timer); window.removeEventListener("pageshow", check); document.removeEventListener("visibilitychange", check); };
  }, [deadline, url]);
  useEffect(() => {
    if (!url || unavailable) return;
    let current = true;
    void import("qrcode").then(module => module.toDataURL(url, { type: "image/png", width: 256, margin: 4, errorCorrectionLevel: "M", color: { dark: "#192e2eff", light: "#ffffffff" } }))
      .then(png => { if (current && Date.now() < deadline) setImage({ url, png }); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [url, unavailable, deadline]);
  async function copyLink() {
    if (!url || Date.now() >= deadline) return;
    try { await navigator.clipboard.writeText(url); if (Date.now() < deadline) setCopy({ url, message: "Enlace público copiado. No incluye tu sesión." }); }
    catch { if (Date.now() < deadline) setCopy({ url, message: "No pudimos copiarlo. Usá el enlace textual o copiá su dirección desde el navegador." }); }
  }
  if (!path || unavailable) return <p>El enlace ya no está disponible para compartir.</p>;
  return <div className={styles.share}>
    <div className="stack"><p>El QR y el enlace abren únicamente la consulta pública. No confirman retiro ni entrega y no otorgan permisos de operación.</p>
      <div className="actions"><ActionLink href={url ?? path}>Abrir trazabilidad pública</ActionLink>{url && <ActionButton type="button" secondary onClick={copyLink}>Copiar enlace</ActionButton>}</div>
      {url ? <a className="identifier" href={url}>{url}</a> : <p>No está disponible el origen público configurado. Podés consultar mediante el enlace interno; el QR y la copia absoluta no están disponibles.</p>}
      {copy?.url === url && <p role="status">{copy.message}</p>}
    </div>
    {url && <figure className={styles.qr}>{image?.url === url ? <img src={image.png} width={256} height={256} alt="QR de la consulta pública; abre el mismo enlace textual que acompaña esta imagen." />
      : <div className={styles.placeholder} role="status">{failed ? "No pudimos generar el QR. Usá el enlace textual." : "Generando QR…"}</div>}<figcaption>Consulta pública · solo lectura</figcaption></figure>}
  </div>;
}
