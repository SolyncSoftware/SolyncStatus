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

	async function probe(service: Service): Promise<LiveResult> {
		const started = performance.now();
		try {
			await fetch(service.url, {
				mode: 'no-cors',
				cache: 'no-store',
				signal: AbortSignal.timeout(timeoutMs),
			});
			return {
				id: service.id,
				online: true,
				status: null,
				error: null,
				responseTime: Math.round(performance.now() - started),
				checked: new Date().toISOString(),
			};
		} catch (error) {
			return {
				id: service.id,
				online: false,
				status: null,
				error: error instanceof Error && error.name === 'TimeoutError' ? 'Request timed out' : 'Unreachable',
				responseTime: 0,
				checked: new Date().toISOString(),
			};
		}
	}

	async function fetchApi(): Promise<LiveResult[]> {
		const response = await fetch(apiUrl, {
			cache: 'no-store',
			signal: AbortSignal.timeout(timeoutMs),
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

<header
	class="mb-8 flex items-center justify-between gap-4 rounded-card border border-offwhite bg-paper p-6 max-sm:flex-col"
>
	<div class="flex items-center justify-center gap-4">
		<img src="/logo.png" alt="Solync Logo" class="max-h-20" />
	</div>
	<div class="text-center">
		Last checked: <span>{new Date(lastCheckedAt).toLocaleString()}</span>
	</div>
</header>

<div class="mb-8 flex flex-col gap-6">
	{#if views.length < 1}
		<div class="w-full overflow-hidden rounded-card border border-error bg-paper">
			<details open>
				<summary
					class="cursor-pointer list-none border-b border-accent px-6 py-4 font-bold [&::-webkit-details-marker]:hidden"
				>
					Well, that's a bit odd...
				</summary>
				<div class="p-6">There are no tracked sites at this time.</div>
			</details>
		</div>
	{:else}
		{#each views as view (view.id)}
			<StatusCard {view} />
		{/each}
	{/if}
</div>

<div class="fixed right-8 bottom-8 z-50 max-sm:right-4 max-sm:bottom-4">
	<button
		type="button"
		aria-label="Refresh status"
		class="flex h-15 w-15 cursor-pointer items-center justify-center rounded-card border border-offwhite bg-accent text-2xl font-bold text-paper shadow-glow transition-shadow hover:shadow-glow-lg"
		onclick={() => refresh(true)}
	>
		&#8635;
	</button>
</div>
