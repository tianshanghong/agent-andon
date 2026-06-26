import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// Starlight owns the `docs` collection (src/content/docs/**). The custom marketing
// landing stays a file route (src/pages/index.astro + locale pages); docs live under /docs/.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
