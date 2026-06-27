import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// Starlight owns the `docs` collection (src/content/docs/**). The custom marketing
// landing stays a file route (src/pages/index.astro + locale pages); docs live under /docs/.
// The `blog` collection (src/content/blog/**) renders at /blog/<slug>/, and the `guides`
// collection (src/content/guides/**) renders evergreen intent pages at /guides/<slug>/.
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
  // Evergreen how-to guides — one per high-intent search query (no pubDate; not time-ordered).
  guides: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/guides" }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      updated: z.coerce.date().optional(),
      // optional HowTo steps → Guide.astro emits HowTo JSON-LD (GEO) for step-by-step guides.
      howto: z.array(z.object({ name: z.string(), text: z.string() })).optional(),
    }),
  }),
};
