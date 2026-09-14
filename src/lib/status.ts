export interface Service {
    /** Stable identifier used for keys and history lookups. */
    id: string;
    /** Human readable name shown on the status page. */
    name: string;
    /** URL that is probed to determine availability. */
    url: string;
    /** Optional grouping label, e.g. "Infrastructure". */
    group?: string;
    /** Optional longer description shown to users. */
    description?: string;
}

export interface ServiceStatus {
    service: Service;
    /** HTTP status code, or null when the request never completed. */
    status: number | null;
    online: boolean;
    responseTime: number;
    error: string | null;
    checked: Date;
}

/** Serializable status shape shared by SSR and the Svelte client component. */
export interface StatusView {
    id: string;
    name: string;
    url: string;
    online: boolean;
    status: number | null;
    error: string | null;
    responseTime: number;
    /** ISO timestamp. */
    checked: string;
}

/** Result shape returned by the status API / client probe. */
export interface LiveResult {
    id: string;
    online: boolean;
    status: number | null;
    error: string | null;
    responseTime: number;
    checked?: string;
}

export function toStatusView(status: ServiceStatus): StatusView {
    return {
        id: status.service.id,
        name: status.service.name,
        url: status.service.url,
        online: status.online,
        status: status.status,
        error: status.error,
        responseTime: status.responseTime,
        checked: status.checked.toISOString()
    };
}

export function applyLiveResult(view: StatusView, result: LiveResult): StatusView {
    return {
        ...view,
        online: result.online,
        status: result.status,
        error: result.error,
        responseTime: result.responseTime,
        checked: result.checked ?? new Date().toISOString()
    };
}

/** Human readable status line, shared so SSR and client never drift. */
export function statusLabel(view: Pick<StatusView, 'online' | 'status'>): string {
    if (view.status == null) return view.online ? 'Reachable' : 'No response';
    return `${view.status} ${view.online ? 'OK' : 'NOT OK'}`;
}

export const DEFAULT_TIMEOUT_MS = 5000;

const USER_AGENT = 'SolyncStatus/1.0 (+https://status.solync.org)';

/**
 * Probe a single service. A response is considered online when it is a 2xx/3xx
 * status, or a 403 (some upstreams block the probe's user agent but are up).
 */
export async function checkService(service: Service, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<ServiceStatus> {
    const checked = new Date();
    const started = Date.now();

    try {
        const response = await fetch(service.url, {
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': USER_AGENT
            },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'follow'
        });

        const online = response.ok || response.status === 403;

        return {
            service,
            checked,
            status: response.status,
            online,
            responseTime: Date.now() - started,
            error: online ? null : 'Bad response code'
        };
    } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError';

        return {
            service,
            checked,
            status: null,
            online: false,
            responseTime: 0,
            error: timedOut ? 'Request timed out' : error instanceof Error ? error.message : String(error)
        };
    }
}

/** Probe every service concurrently, preserving the input order. */
export async function checkAllServices(services: Service[], timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<ServiceStatus[]> {
    return Promise.all(services.map((service) => checkService(service, timeoutMs)));
}
