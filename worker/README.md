# Solync Status API (Cloudflare Worker)

Probes each service server-side (so it can read real HTTP status codes) and caches the
result in Workers KV. Requests are served from KV until the snapshot is older than
`REFRESH_MINUTES`, which is what rate-limits the actual down/up checks.

This is the data source for the Astro client component. Point the site at it with
`PUBLIC_STATUS_API_URL`.

## Endpoints

| Method    | Path             | Description              |
| --------- | ---------------- | ------------------------ |
| `GET`     | `/` or `/status` | Current snapshot as JSON |
| `OPTIONS` | any              | CORS preflight           |

Response shape (matches `StatusBoard.astro`):

```json
{
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "refreshMinutes": 5,
    "cached": true,
    "services": [
        {
            "id": "solynclanding",
            "online": true,
            "status": 200,
            "error": null,
            "responseTime": 123,
            "checked": "2026-01-01T00:00:00.000Z"
        }
    ]
}
```

`cached` is `true` when the response was served from KV without re-probing.

## How the rate limit works

1. On request, the worker reads `snapshot:v1` from KV.
2. If the snapshot is younger than `REFRESH_MINUTES`, it is returned as-is (`cached: true`).
3. Otherwise the worker probes every service concurrently, writes a new snapshot, and
   returns it (`cached: false`).
4. A short-lived `refresh-lock` KV key prevents concurrent requests from stampeding the
   upstream services. It is best-effort because KV is eventually consistent.

The response also sets `Cache-Control: public, max-age=<REFRESH_MINUTES * 60>`, so a CDN
or browser cache can absorb repeat traffic without hitting the worker.

## Configuration

Set in `wrangler.toml` under `[vars]` (per environment) or via the dashboard:

| Variable             | Default                     | Purpose                                         |
| -------------------- | --------------------------- | ----------------------------------------------- |
| `REFRESH_MINUTES`    | `5`                         | Minutes before the snapshot is considered stale |
| `REQUEST_TIMEOUT_MS` | `5000`                      | Per-service probe timeout                       |
| `ALLOWED_ORIGIN`     | `https://status.solync.org` | Comma-separated CORS origins, or `*`            |

Services are imported from `../src/content/services/*.json`, the same files that back the
Astro content collection, so URLs are not duplicated.

## Deploy

```sh
cd worker
pnpm install
pnpm exec wrangler kv namespace create STATUS_KV   # paste the id into wrangler.toml
pnpm deploy
```

Then set the site's `PUBLIC_STATUS_API_URL` to the deployed URL, e.g.
`https://solync-status-api.<account>.workers.dev/status`, and rebuild.

Local development:

```sh
pnpm dev
```
