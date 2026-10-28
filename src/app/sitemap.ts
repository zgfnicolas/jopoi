import type { MetadataRoute } from "next";
import { indexableOrigin } from "@/server/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = indexableOrigin();
  return origin ? [{ url: origin }] : [];
}
