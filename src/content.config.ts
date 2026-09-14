import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * Services we monitor. This collection holds *static metadata* only — the live
 * status is probed at build time (see `src/lib/status.ts`), because uptime is
 * inherently dynamic and can't live in committed content.
 */
const services = defineCollection({
    loader: glob({ base: './src/content/services', pattern: '**/*.json' }),
    schema: z.object({
        name: z.string(),
        url: z.url(),
        group: z.string().optional(),
        description: z.string().optional()
    })
});

export const collections = { services };
