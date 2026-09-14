<script lang="ts">
    import { onMount } from 'svelte';
    import type { LiveResult, Service, StatusView } from '../lib/status';
    import { applyLiveResult } from '../lib/status';
    import StatusCard from './StatusCard.svelte';

    interface Props {
        initialViews: StatusView[];
        services: Service[];
        /** ISO timestamp of the build-time probe. */
        lastChecked: string;
        /** Minutes between live refreshes. */
        refreshMinutes?: number;
        /** Optional JSON endpoint that returns live probe results. */
        apiUrl?: string;
    }

    let { initialViews, services, lastChecked, refreshMinutes = 5, apiUrl = '' }: Props = $props();

    const intervalMs = Math.max(1, refreshMinutes) * 60_000;
    const timeoutMs = 5000;
    const debounceMs = 1000;

    let views = $state<StatusView[]>(initialViews);
    let lastCheckedAt = $state(lastChecked);
    let inFlight = false;
    let lastFetchedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const totalServices = $derived(views.length);
    const onlineServices = $derived(views.filter((view) => view.online).length);
    const impactedServices = $derived(views.filter((view) => !view.online).length);
    const healthPercent = $derived(totalServices === 0 ? 100 : Math.round((onlineServices / totalServices) * 100));
    const healthLabel = $derived(impactedServices === 0 ? 'Online' : impactedServices === totalServices ? 'Offline' : 'Partial outage');
    const healthTone = $derived(
        impactedServices === 0 ? 'bg-success text-paper' : impactedServices === totalServices ? 'bg-error text-paper' : 'bg-warning text-ink'
    );

    async function probe(service: Service): Promise<LiveResult> {
        const started = performance.now();
        try {
            await fetch(service.url, {
                mode: 'no-cors',
                cache: 'no-store',
                signal: AbortSignal.timeout(timeoutMs)
            });
            return {
                id: service.id,
                online: true,
                status: null,
                error: null,
                responseTime: Math.round(performance.now() - started),
                checked: new Date().toISOString()
            };
        } catch (error) {
            return {
                id: service.id,
                online: false,
                status: null,
                error: error instanceof Error && error.name === 'TimeoutError' ? 'Request timed out' : 'Unreachable',
                responseTime: 0,
                checked: new Date().toISOString()
            };
        }
    }

    async function fetchApi(): Promise<LiveResult[]> {
        const response = await fetch(apiUrl, {
            cache: 'no-store',
            signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) throw new Error(`Status API returned ${response.status}`);
        const data = (await response.json()) as LiveResult[] | { services?: LiveResult[] };
        return Array.isArray(data) ? data : (data.services ?? []);
    }

    function applyResults(results: LiveResult[]): void {
        const byId = new Map(results.map((result) => [result.id, result]));
        views = views.map((view) => {
            const result = byId.get(view.id);
            return result ? applyLiveResult(view, result) : view;
        });
        lastCheckedAt = new Date().toISOString();
    }

    function schedule(): void {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (document.hidden) return schedule();
            void refresh(true);
        }, intervalMs);
    }

    async function refresh(force: boolean): Promise<void> {
        if (inFlight) return;
        if (!force && Date.now() - lastFetchedAt < debounceMs) return;

        inFlight = true;
        try {
            const results = apiUrl ? await fetchApi() : await Promise.all(services.map(probe));
            applyResults(results);
            lastFetchedAt = Date.now();
        } catch (error) {
            console.error('[SolyncStatus] refresh failed', error);
        } finally {
            inFlight = false;
            schedule();
        }
    }

    onMount(() => {
        const onVisibilityChange = () => {
            if (!document.hidden) void refresh(false);
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        void refresh(true);

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            clearTimeout(timer);
        };
    });
</script>

<header class="bg-paper/90 mb-8 overflow-hidden rounded-[32px] p-5 shadow-[0_18px_60px_rgba(34,34,34,0.06)] backdrop-blur-sm sm:p-6">
    <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <a class="flex items-center gap-3" href="https://solync.org/">
            <img src="/logo.png" alt="Solync logo" class="h-16 w-auto max-w-55 object-contain sm:h-20" />
        </a>

        <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <p class="text-ink/75 text-base">
                Last checked: {new Date(lastCheckedAt).toLocaleString()}
            </p>
        </div>
    </div>
</header>

<section class="mb-8 grid gap-4 md:grid-cols-3">
    <div class="bg-paper rounded-[28px] p-5 shadow-[0_10px_30px_rgba(34,34,34,0.04)]">
        <p class="text-ink/55 text-sm font-bold">Services</p>
        <div class="mt-3 flex items-end justify-between gap-4">
            <span class="text-ink text-4xl font-extrabold">{totalServices}</span>
            <span class="bg-offwhite text-ink/70 rounded-full px-2.5 py-1 text-sm font-bold">Tracked</span>
        </div>
    </div>

    <div class="bg-paper rounded-[28px] p-5 shadow-[0_10px_30px_rgba(34,34,34,0.04)]">
        <p class="text-ink/55 text-sm font-bold">Healthy</p>
        <div class="mt-3 flex items-end justify-between gap-4">
            <span class="text-ink text-4xl font-extrabold">{onlineServices}</span>
            <span class="bg-success/10 text-success rounded-full px-2.5 py-1 text-sm font-bold">{healthPercent}%</span>
        </div>
    </div>

    <div class="bg-paper rounded-[28px] p-5 shadow-[0_10px_30px_rgba(34,34,34,0.04)]">
        <p class="text-ink/55 text-sm font-bold">Incidents</p>
        <div class="mt-3 flex items-end justify-between gap-4">
            <span class="text-ink text-4xl font-extrabold">{impactedServices}</span>
            <span class={`rounded-full px-2.5 py-1 text-sm font-bold ${healthTone}`}>
                {healthLabel}
            </span>
        </div>
    </div>
</section>

<div class="mb-8 flex flex-col gap-5">
    {#if views.length < 1}
        <div class="bg-paper w-full overflow-hidden rounded-[28px] p-6 shadow-[0_10px_30px_rgba(34,34,34,0.04)]">
            <p class="text-ink text-lg font-bold">Well, that's a bit odd...</p>
            <p class="text-ink/70 mt-2">There are no tracked sites at this time.</p>
        </div>
    {:else}
        <div class="grid gap-5 xl:grid-cols-2">
            {#each views as view (view.id)}
                <StatusCard {view} />
            {/each}
        </div>
    {/if}
</div>

<div class="fixed right-8 bottom-8 z-50 max-sm:right-4 max-sm:bottom-4">
    <button
        type="button"
        aria-label="Refresh status"
        class="rounded-card bg-accent text-paper shadow-glow hover:shadow-glow-lg flex h-15 w-15 cursor-pointer items-center justify-center text-2xl font-bold transition-shadow"
        onclick={() => refresh(true)}
    >
        &#8635;
    </button>
</div>
