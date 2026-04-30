<?php

namespace App\Services\Media\Cdn;

use RuntimeException;

class CloudflareCdnDriver implements CdnProviderContract
{
    public function transformUrl(string $sourcePath, ?string $conversion = null, array $hints = []): string
    {
        $base = rtrim((string) config('cdn.base_url'), '/');
        $path = '/'.ltrim($sourcePath, '/');

        return $base.$path;
    }

    public function signUrl(string $sourcePath, ?string $conversion = null, int $ttlSeconds = 300, array $hints = []): string
    {
        throw new RuntimeException('CloudflareCdnDriver does not support signed URLs — use BunnyCdnDriver or implement Cloudflare Workers signing.');
    }

    public function purge(array $urls): bool
    {
        throw new RuntimeException('CloudflareCdnDriver purge is not implemented — use the Cloudflare dashboard or implement the Cache-Purge API.');
    }

    public function healthCheck(): bool
    {
        throw new RuntimeException('CloudflareCdnDriver healthCheck is not implemented.');
    }
}
