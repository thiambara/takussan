# CDN Integration — TCK-105

> ⚠️ **HORS DU CHEMIN depuis le 2026-09-21 — [ADR-0029](../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md).**
> Les médias vivent dans deux seaux R2 par environnement ; les images publiques sont servies par le
> domaine du seau public (`media-preview.takussan.com`, `media.takussan.com`) et transformées par
> Cloudflare (`/cdn-cgi/image/…`, loader de `takussan-web/src/lib/image-loader.ts`) ; les fichiers
> privés ne sortent que par l'API (`App\Services\Media\PrivateMediaAccess`). Rien de ce qui suit
> n'a jamais été activé (`CDN_ENABLED=false` partout), et `cdn.secure_collections` est vide : il
> nommait trois collections qui n'existaient pas. Le retrait de cette intégration est un ticket à
> part. Ce document est conservé pour son historique.
>
> **En service sur la préproduction depuis le 2026-09-22 (TCK-541)** : tous les médias sont sur
> `takussan-preview-private` / `takussan-preview-media`, servis par `media-preview.takussan.com`.
> Mesuré ce jour-là : la même conversion `preview` pèse 45 Ko en JPEG direct, **16 Ko en AVIF** et
> 17 Ko en WebP par `/cdn-cgi/image/width=640,quality=75,format=auto/…` ; 48 images sur 48 de
> l'accueil passent par Transformations. La production suivra en phase F — bascule de l'API
> **avant** le front, l'inverse de ce qui s'est fait en préproduction (relevé dans TCK-541).

## Provider choice

**Default: Bunny CDN** (`CDN_PROVIDER=bunny`).

Cloudflare is available as a stub (`CDN_PROVIDER=cloudflare`) but `signUrl`, `purge`, and `healthCheck` are not implemented — they throw `RuntimeException`. Use Bunny unless you implement the Cloudflare Workers signing adapter.

---

## Environment variables

```dotenv
# Master switch — set true only once the CDN is provisioned.
CDN_ENABLED=false
CDN_PROVIDER=bunny          # bunny | cloudflare
CDN_BASE_URL=               # e.g. https://takussan.b-cdn.net
CDN_PULL_ZONE=              # Bunny pull-zone name
CDN_SIGNING_KEY=            # Token Authentication signing key
CDN_SIGNATURE_TTL=300       # Signed URL TTL in seconds (default 5 min)

# Bunny-specific
BUNNY_ACCESS_KEY=           # Bunny API access key (for purge calls)
BUNNY_STORAGE_ZONE=         # Bunny storage zone name (future use)

# Cloudflare (stub only — not functional)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

> **`CDN_ENABLED=false` by default.** Flipping to `true` with no `CDN_BASE_URL` set will cause every media URL to silently fall back to storage (the `CdnUrlGenerator` catches all `Throwable`).

---

## Rotation of `CDN_SIGNING_KEY` — double-key window

Bunny Token Authentication uses a single key per pull zone. To rotate without URL downtime:

1. Generate new key: `openssl rand -hex 32`
2. Add the new key as `CDN_SIGNING_KEY` in staging — verify signed URLs work.
3. In the Bunny dashboard, update the pull-zone Token Authentication key.
4. Deploy the new `CDN_SIGNING_KEY` to production.
5. Old signed URLs issued with the previous key will 403 after their TTL expires (max 5 min). No action required.

---

## Secure collections

Collections listed in `cdn.secure_collections` (default: `lease_documents`, `contract_documents`, `property_archived_photos`) always receive a time-limited signed URL regardless of whether the caller is authenticated. To add a collection:

```php
// config/cdn.php
'secure_collections' => [
    'lease_documents',
    'contract_documents',
    'property_archived_photos',
    'your_new_sensitive_collection',
],
```

---

## Circuit breaker (CdnHealthGuard)

| Config key | Default | Meaning |
|---|---|---|
| `cdn.health.threshold` | 5 | Errors within the rolling window before the circuit opens |
| `cdn.health.window` | 60 s | Rolling window for error counting |
| `cdn.health.cooldown` | 300 s | How long the circuit stays open before auto-reset |

When the circuit is open all URLs fall back to storage (transparent to the user) and a `cdn.fallback_open_breaker` warning is logged.

---

## Runbook — incident response

### Purge a URL manually (Tinker)

```php
php artisan tinker
>>> app(\App\Services\Media\Cdn\CdnProviderContract::class)
...     ->purge(['https://your-cdn-url.b-cdn.net/media/42/photo.jpg']);
```

### Take CDN offline immediately

```dotenv
CDN_ENABLED=false
```

Deploy or run `php artisan config:clear` — all URLs will route through local storage instantly.

### Reset circuit breaker manually

```php
php artisan tinker
>>> app(\App\Services\Media\Cdn\CdnHealthGuard::class)->reset();
```

### Bulk purge after `media:cleanup`

If you run Spatie's `media-library:clean` command in bulk, the observer fires for each deleted item. For very large purge batches (>10 000 items) consider temporarily setting `CDN_ENABLED=false` during the cleanup to avoid flooding the Bunny purge API, then re-enable and request a full zone purge from the Bunny dashboard.

---

## Health endpoint

```
GET /api/health
```

Public, no auth required, always returns HTTP 200. Monitor the body:

```json
{
  "status": "ok",
  "checks": {
    "cdn":   "ok | degraded | disabled",
    "queue": "ok | degraded"
  }
}
```

Use `status = degraded` as the alert trigger in your uptime monitor.

---

## Pricing watch

- Bunny charges per GB served.
- Keep an eye on monthly transfer with `php artisan tinker` + Bunny API stats, or set a billing alert in the Bunny dashboard.
- Large uploads via `media:cleanup` rollbacks or seeder re-runs can spike outbound transfer. Set `CDN_ENABLED=false` in local/CI environments.
