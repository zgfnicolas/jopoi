import "server-only";
import type { Metadata } from "next";
import { getPublicOrigin } from "./public-origin";

export const SITE_DESCRIPTION = "Una propuesta para conectar materiales aprovechables, compradores y transporte. Explorá el prototipo de Jopói con datos ficticios de Corrientes.";
/** Deployment metadata is public. Never derive an origin from a request Host header. */
export function indexableOrigin(): string | null {
  const origin = getPublicOrigin();
  return process.env.VERCEL_ENV === "production" && origin?.startsWith("https://") ? origin : null;
}
export function siteMetadata(): Metadata {
  const origin = getPublicOrigin();
  return {
    title: { default: "Jopói · materiales, compradores y transporte", template: "%s · Jopói" },
    description: SITE_DESCRIPTION,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    robots: { index: false, follow: false },
    openGraph: { type: "website", locale: "es_AR", siteName: "Jopói", title: "Jopói · coordinación de materiales", description: SITE_DESCRIPTION },
    twitter: { card: "summary_large_image", title: "Jopói · coordinación de materiales", description: SITE_DESCRIPTION },
  };
}
export function homeMetadata(): Metadata {
  const origin = indexableOrigin();
  return { robots: { index: Boolean(origin), follow: Boolean(origin) }, ...(origin ? { alternates: { canonical: origin } } : {}) };
}
