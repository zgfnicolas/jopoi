"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import type {
  RumDeviceClass,
  RumMetricInput,
  RumMetricName,
  RumRoute,
} from "@/shared/rum-contracts";

function getDeviceClass(): RumDeviceClass {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia("(max-width: 768px) and (pointer: coarse)").matches) return "mobile";
  if (window.matchMedia("(max-width: 1024px)").matches) return "tablet";
  return "desktop";
}

function getRouteTemplate(pathname: string): RumRoute {
  if (pathname === "/") return "/";
  if (pathname === "/demo") return "/demo";
  if (pathname.startsWith("/trazabilidad/")) return "/trazabilidad/:traceId";
  return "other";
}

function getConnectionType(): "4g" | "3g" | "2g" | "slow-2g" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  const type = conn?.effectiveType;
  if (type === "4g" || type === "3g" || type === "2g" || type === "slow-2g") return type;
  return "unknown";
}

/**
 * Colector de RUM (Real User Monitoring) en el navegador.
 * Envía exclusivamente métricas LCP, INP y CLS con contexto mínimo:
 * ruta plantilla y clase de dispositivo.
 * NUNCA envía URLs libres, query strings, UUIDs de recorrido, contactos ni credenciales (AUD-11).
 */
export function RumCollector(): null {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    const name = metric.name;
    if (name !== "LCP" && name !== "INP" && name !== "CLS") {
      return;
    }

    const payload: RumMetricInput = {
      metric: name as RumMetricName,
      value: Math.round(metric.value * 100) / 100,
      route: getRouteTemplate(pathname || "/"),
      device: getDeviceClass(),
      version: "0.1.0",
      rating: metric.rating as "good" | "needs-improvement" | "poor" | undefined,
      connection: getConnectionType(),
    };

    const serialized = JSON.stringify(payload);

    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const sent = navigator.sendBeacon("/api/rum", new Blob([serialized], { type: "application/json" }));
        if (sent) return;
      }

      void fetch("/api/rum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // La telemetría nunca debe interrumpir la navegación del usuario
    }
  });

  return null;
}
