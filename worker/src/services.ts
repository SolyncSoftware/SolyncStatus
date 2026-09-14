import landing from '../../src/content/services/solynclanding.json';
import landingAlpha from '../../src/content/services/landingalpha.json';
import gardens from '../../src/content/services/services-gardens.json';
import infrastructure from '../../src/content/services/sl-cherish.json';

export interface Service {
	id: string;
	name: string;
	url: string;
}

/**
 * Services the worker probes.
 *
 * These import the same JSON that backs the Astro `services` content
 * collection, so URLs are not duplicated. Adding a service means adding a JSON
 * file there and one entry here. If this worker is ever extracted into its own
 * repository, inline this list instead.
 */
export const services: Service[] = [
	{ id: 'solynclanding', ...landing },
	{ id: 'landingalpha', ...landingAlpha },
	{ id: 'services-gardens', ...gardens },
	{ id: 'sl-cherish', ...infrastructure },
];
