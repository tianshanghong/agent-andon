import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// Starlight owns the `docs` collection (src/content/docs/**). The custom marketing
// landing stays a file route (src/pages/index.astro + locale pages); docs live under /docs/.
// The `blog` collection (src/content/blog/**) renders at /blog/<slug>/.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  blog: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updated: z.coerce.date().optional(),
    }),
  }),
};
