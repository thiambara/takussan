<?php

namespace App\Services\Media;

use App\Services\Media\Cdn\CdnHealthGuard;
use App\Services\Media\Cdn\CdnProviderContract;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class MediaUrlResolver
{
    public function __construct(
        private readonly CdnProviderContract $cdn,
        private readonly CdnHealthGuard $guard,
    ) {}

    /**
     * Resolve the public URL for a Media object.
     *
     * Decision order (mirrors plan §MediaUrlResolver):
     *   1. CDN disabled          → storage URL
     *   2. Circuit breaker open  → storage URL + log warning
     *   3. Secure collection     → CDN signed URL
     *   4. Default               → CDN transform URL
     * Any driver exception falls back to storage URL and increments the
     * failure counter.
     *
     * @param  Media  $media  The Spatie Media row
     * @param  string  $storageUrl  The local/storage URL already computed by Spatie
     * @param  string|null  $conversion  Optional conversion name (e.g. "thumbnail")
     * @param  array  $hints  Runtime hints — 'accept' key carries the HTTP Accept header
     */
    public function resolve(Media $media, string $storageUrl, ?string $conversion = null, array $hints = []): string
    {
        if (! config('cdn.enabled')) {
            return $storageUrl;
        }

        if ($this->guard->isOpen()) {
            // Log once per breaker-open window to avoid flooding logs when a
            // single request resolves dozens of media URLs during an outage.
            if (Cache::add('cdn.fallback_open_breaker_logged', 1, 60)) {
                Log::warning('cdn.fallback_open_breaker', [
                    'media_id' => $media->getKey(),
                    'collection' => $media->collection_name,
                ]);
            }

            return $storageUrl;
        }

        $path = $this->extractPath($storageUrl);

        try {
            if ($this->isSecureCollection($media)) {
                $ttl = isset($hints['ttl']) && (int) $hints['ttl'] > 0
                    ? (int) $hints['ttl']
                    : (int) config('cdn.signature_ttl', 300);

                return $this->cdn->signUrl($path, $conversion, $ttl, $hints);
            }

            return $this->cdn->transformUrl($path, $conversion, $hints);
        } catch (\Throwable $e) {
            $this->guard->recordFailure();

            Log::warning('cdn.fallback_driver_exception', [
                'media_id' => $media->getKey(),
                'collection' => $media->collection_name,
                'error' => $e->getMessage(),
            ]);

            return $storageUrl;
        }
    }

    private function isSecureCollection(Media $media): bool
    {
        $secure = (array) config('cdn.secure_collections', []);

        return in_array($media->collection_name, $secure, true);
    }

    /**
     * Extract the path component from a full storage URL so the CDN driver
     * only receives a clean relative path (no origin host).
     */
    private function extractPath(string $storageUrl): string
    {
        $parsed = parse_url($storageUrl, PHP_URL_PATH);

        return $parsed ?: $storageUrl;
    }
}
