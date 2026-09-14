import { getCollection } from 'astro:content';
import type { Service } from './status';

/**
 * Read the `services` content collection and adapt entries to the probe shape.
 *
 * `getCollection` only works in server/build code, which is exactly where the
 * status probe runs. The collection supplies metadata; `src/lib/status.ts`
 * supplies live uptime.
 */
export async function getServices(): Promise<Service[]> {
	const entries = await getCollection('services');

	return entries.map((entry) => ({
		id: entry.id,
		name: entry.data.name,
		url: entry.data.url,
		group: entry.data.group,
		description: entry.data.description,
	}));
}
