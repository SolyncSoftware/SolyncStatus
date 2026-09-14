import { services, type Service } from './services';

export interface Env {
	/** KV namespace used to cache the latest probe results. */
	STATUS_KV: KVNamespace;
	/** Minutes a cached snapshot stays fresh before services are re-checked. */
	REFRESH_MINUTES?: string;
	/** Per-request timeout when probing a service, in milliseconds. */
	REQUEST_TIMEOUT_MS?: string;
	/** Comma-separated list of allowed CORS origins, or `*`. */
	ALLOWED_ORIGIN?: string;
}

interface ProbeResult {
	id: string;
	online: boolean;
	status: number | null;
	error: string | null;
	responseTime: number;
	checked: string;
}

interface Snapshot {
	updatedAt: string;
	services: ProbeResult[];
}

const SNAPSHOT_KEY = 'snapshot:v1';
const LOCK_KEY = 'refresh-lock';
const DEFAULT_REFRESH_MINUTES = 5;
const DEFAULT_TIMEOUT_MS = 5000;
const USER_AGENT = 'SolyncStatus/1.0 (+https://status.solync.org)';

function readMinutes(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveOrigin(env: Env, requestOrigin: string | null): string {
	const allowed = (env.ALLOWED_ORIGIN ?? '*')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);

	if (allowed.includes('*')) return '*';
	if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
	return allowed[0] ?? '';
}

function responseHeaders(env: Env, request: Request, maxAgeSeconds: number): Headers {
	const headers = new Headers({
		'Content-Type': 'application/json; charset=utf-8',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		Vary: 'Origin',
	});
	const origin = resolveOrigin(env, request.headers.get('Origin'));
	if (origin) headers.set('Access-Control-Allow-Origin', origin);
	if (maxAgeSeconds > 0) headers.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
	return headers;
}

async function probe(service: Service, timeoutMs: number): Promise<ProbeResult> {
	const started = Date.now();

	try {
		const response = await fetch(service.url, {
			headers: {
				Accept: 'text/html,application/xhtml+xml',
				'User-Agent': USER_AGENT,
			},
			signal: AbortSignal.timeout(timeoutMs),
			redirect: 'follow',
		});

		const online = response.ok || response.status === 403;

		return {
			id: service.id,
			online,
			status: response.status,
			error: online ? null : 'Bad response code',
			responseTime: Date.now() - started,
			checked: new Date().toISOString(),
		};
	} catch (error) {
		const timedOut = error instanceof Error && error.name === 'TimeoutError';

		return {
			id: service.id,
			online: false,
			status: null,
			error: timedOut ? 'Request timed out' : error instanceof Error ? error.message : String(error),
			responseTime: 0,
			checked: new Date().toISOString(),
		};
	}
}

async function readSnapshot(env: Env): Promise<Snapshot | null> {
	const raw = await env.STATUS_KV.get(SNAPSHOT_KEY);
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Snapshot;
		if (!parsed || !Array.isArray(parsed.services) || typeof parsed.updatedAt !== 'string') return null;
		return parsed;
	} catch {
		return null;
	}
}

/**
 * Re-probe every service and persist the snapshot. A short-lived KV lock keeps
 * concurrent requests from stampeding the upstream services; it is best-effort
 * because KV is eventually consistent.
 */
async function refresh(env: Env, timeoutMs: number): Promise<Snapshot> {
	await env.STATUS_KV.put(LOCK_KEY, String(Date.now()), { expirationTtl: 60 });

	try {
		const results = await Promise.all(services.map((service) => probe(service, timeoutMs)));
		const snapshot: Snapshot = { updatedAt: new Date().toISOString(), services: results };
		await env.STATUS_KV.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
		return snapshot;
	} finally {
		await env.STATUS_KV.delete(LOCK_KEY);
	}
}

async function getSnapshot(env: Env, timeoutMs: number, refreshMs: number): Promise<{ snapshot: Snapshot; cached: boolean }> {
	const cached = await readSnapshot(env);
	const age = cached ? Date.now() - Date.parse(cached.updatedAt) : Number.POSITIVE_INFINITY;

	if (cached && age < refreshMs) {
		return { snapshot: cached, cached: true };
	}

	const lock = await env.STATUS_KV.get(LOCK_KEY);
	if (lock && cached) {
		return { snapshot: cached, cached: true };
	}

	return { snapshot: await refresh(env, timeoutMs), cached: false };
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const refreshMinutes = readMinutes(env.REFRESH_MINUTES, DEFAULT_REFRESH_MINUTES);
		const refreshMs = refreshMinutes * 60_000;
		const timeoutMs = readMinutes(env.REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: responseHeaders(env, request, refreshMs / 1000) });
		}

		if (request.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), {
				status: 405,
				headers: responseHeaders(env, request, 0),
			});
		}

		if (url.pathname !== '/' && url.pathname !== '/status') {
			return new Response(JSON.stringify({ error: 'Not found' }), {
				status: 404,
				headers: responseHeaders(env, request, 0),
			});
		}

		let result: { snapshot: Snapshot; cached: boolean };
		try {
			result = await getSnapshot(env, timeoutMs, refreshMs);
		} catch (error) {
			return new Response(
				JSON.stringify({ error: 'Probe failed', detail: error instanceof Error ? error.message : String(error) }),
				{ status: 502, headers: responseHeaders(env, request, 0) },
			);
		}

		const body = JSON.stringify({
			updatedAt: result.snapshot.updatedAt,
			refreshMinutes,
			cached: result.cached,
			services: result.snapshot.services,
		});

		return new Response(body, { status: 200, headers: responseHeaders(env, request, refreshMs / 1000) });
	},
} satisfies ExportedHandler<Env>;
