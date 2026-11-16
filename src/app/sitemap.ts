import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { listPublished } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const titles = await listPublished();
  return [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    ...titles.map((t) => ({ url: `${siteUrl}/title/${t.slug}`, lastModified: new Date(t.published_at), priority: 0.8 })),
  ];
}
