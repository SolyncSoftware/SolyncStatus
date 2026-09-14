<script lang="ts">
	import type { StatusView } from '../lib/status';
	import { statusLabel } from '../lib/status';

	interface Props {
		view: StatusView;
	}

	let { view }: Props = $props();

	const pillClass = $derived(view.online ? 'bg-success text-paper' : 'bg-error text-paper');
	const cardClass = $derived(view.online ? 'border-offwhite' : 'border-error hover:shadow-glow-error');
	const rowClass = $derived(
		`flex items-center justify-between gap-2 border-b border-dotted py-2 last:border-b-0 max-sm:flex-col max-sm:items-start ${
			view.online ? 'border-accent' : 'border-error'
		}`,
	);
	const label = $derived(statusLabel(view));
	const checkedText = $derived(new Date(view.checked).toLocaleTimeString());
	const showError = $derived(Boolean(view.error) && !view.online);
</script>

<div
	class="w-full overflow-hidden rounded-card border bg-paper transition-all duration-300 animate-fade-in {cardClass}"
>
	<details class="group" open>
		<summary
			class="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-accent bg-paper px-6 py-4 [&::-webkit-details-marker]:hidden"
		>
			<p
				class="m-0 flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 text-[1.3rem] max-sm:flex-col max-sm:text-[1.1rem]"
			>
				<span class="font-bold">{view.name}</span>
				<span class="text-[0.8rem] font-normal break-all opacity-60">({view.url})</span>
			</p>
			<span class="rounded-full px-3 py-1.5 text-[0.8rem] font-bold tracking-wider uppercase {pillClass}">
				{view.online ? 'ONLINE' : 'ERROR'}
			</span>
		</summary>

		<div class="p-6">
			<div class="flex flex-col gap-1">
				<div class={rowClass}>
					<span>Status:</span>
					<span class="rounded-full px-4 py-1 text-right font-bold {pillClass}">{label}</span>
				</div>

				<div class="{rowClass} {showError ? '' : 'hidden'}">
					<span>Error:</span>
					<span class="rounded-full bg-error px-4 py-1 font-bold text-paper">{view.error ?? ''}</span>
				</div>

				<div class={rowClass}>
					<span>Last Checked:</span>
					<span class="rounded-full px-4 py-1 text-right font-bold">{checkedText}</span>
				</div>
			</div>
		</div>
	</details>
</div>
