<script lang="ts">
    import type { StatusView } from '../lib/status';
    import { statusLabel } from '../lib/status';

    interface Props {
        view: StatusView;
        history: Array<boolean | null>;
    }

    let { view, history }: Props = $props();

    const badgeClass = $derived(view.online ? 'border-success/25 bg-success/10 text-success' : 'border-error/25 bg-error/10 text-error');
    const dotClass = $derived(view.online ? 'bg-success' : 'bg-error');
    const label = $derived(statusLabel(view));
    const checkedText = $derived(new Date(view.checked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const latencyText = $derived(view.responseTime ? `${view.responseTime} ms` : '—');
    const showError = $derived(Boolean(view.error) && !view.online);
</script>

<article
    class="border-accent/15 bg-paper animate-fade-in w-full overflow-hidden rounded-[28px] border p-5 shadow-[0_12px_35px_rgba(34,34,34,0.05)] transition-all duration-300"
>
    <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-center gap-3">
            <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2 align-middle">
                    <span class={`inline-block h-3 w-3 shrink-0 rounded-full ${dotClass}`}></span>
                    <h2 class="text-ink truncate text-xl font-bold">{view.name}</h2>
                    <span class={`rounded-full border px-2 py-0.5 text-sm font-bold ${badgeClass}`}>
                        {view.online ? 'Online' : 'Error'}
                    </span>
                </div>
                <a class="text-ink/65 mt-1 truncate text-sm hover:underline" href={view.url} target="_blank">{view.url}</a>
            </div>
        </div>
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="bg-offwhite rounded-2xl px-3 py-2.5">
            <p class="text-ink/55 text-sm font-bold">status</p>
            <p class="text-ink mt-1 font-bold">{label}</p>
        </div>
        <div class="bg-offwhite rounded-2xl px-3 py-2.5">
            <p class="text-ink/55 text-sm font-bold">latency</p>
            <p class="text-ink mt-1 font-bold">{latencyText}</p>
        </div>
        <div class="bg-offwhite rounded-2xl px-3 py-2.5">
            <p class="text-ink/55 text-sm font-bold">checked</p>
            <p class="text-ink mt-1 font-bold">{checkedText}</p>
        </div>
    </div>

    <div class="mt-4">
        <div class="mb-2 flex items-center justify-between gap-3">
            <p class="text-ink/55 text-sm font-bold">downtime (red means error)</p>
            <p class="text-ink/55 text-sm">last 30 checks</p>
        </div>
        <div class="flex h-2 gap-1" aria-label="Downtime history for the last 30 checks">
            {#each history as result}
                <span class={`min-w-0 flex-1 rounded-full ${result === null ? 'bg-ink/15' : result ? 'bg-success' : 'bg-error'}`} aria-hidden="true"
                ></span>
            {/each}
        </div>
    </div>

    {#if showError}
        <div class="border-error/20 bg-error/5 text-error mt-4 rounded-2xl border px-3 py-3 text-[0.85rem]">
            <span class="font-bold">error:</span>
            <span class="ml-2 font-medium">{view.error ?? ''}</span>
        </div>
    {/if}
</article>
