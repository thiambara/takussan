<?php

namespace App\Services\Media\Cdn;

interface CdnProviderContract
{
    /**
     * Return the CDN URL for a source path, optionally targeting a named
     * conversion.  $hints may carry Accept-header context (`accept` key)
     * so the driver can append the negotiated format parameter.
     */
    public function transformUrl(string $sourcePath, ?string $conversion = null, array $hints = []): string;

    /**
     * Return a time-limited signed URL for a private/secure source path.
     */
    public function signUrl(string $sourcePath, ?string $conversion = null, int $ttlSeconds = 300, array $hints = []): string;

    /**
     * Purge a list of absolute CDN URLs from the edge cache.
     * Returns true when the purge request was accepted.
     */
    public function purge(array $urls): bool;

    /**
     * Perform a lightweight health check against the CDN.
     * Returns true when the CDN edge is reachable.
     */
    public function healthCheck(): bool;
}
