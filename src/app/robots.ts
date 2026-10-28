import type { MetadataRoute } from "next";
import { indexableOrigin } from "@/server/seo";
export default function robots(): MetadataRoute.Robots {
  const origin = indexableOrigin();
  // Crawlable private routes must expose their noindex; robots.txt is not access control.
  return { rules: { userAgent: "*", allow: "/" }, ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
