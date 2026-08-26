<script lang="ts">
	import './layout.css';

	const { children } = $props();
</script>

<main class="prose">
	{@render children()}
</main>
