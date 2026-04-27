<?php

namespace App\Services\Media\Cdn;

use App\Services\Media\MediaUrlResolver;
use Spatie\MediaLibrary\Support\UrlGenerator\DefaultUrlGenerator;

class CdnUrlGenerator extends DefaultUrlGenerator
{
    /**
     * Return the CDN URL for this media item.
     *
     * The Accept header is captured from the current HTTP request (when
     * available) and passed as a hint to the driver so it can negotiate
     * the optimal image format (avif/webp/jpeg).
     *
     * Any Throwable from the resolver falls back to the default Spatie URL
     * so the application never breaks due to a CDN misconfiguration.
     */
    public function getUrl(): string
    {
        $storageUrl = parent::getUrl();

        try {
            /** @var MediaUrlResolver $resolver */
            $resolver = app(MediaUrlResolver::class);

            $accept = request()?->header('Accept', '') ?? '';

            return $resolver->resolve(
                media: $this->media,
                storageUrl: $storageUrl,
                conversion: $this->conversion?->getName(),
                hints: $accept !== '' ? ['accept' => $accept] : [],
            );
        } catch (\Throwable) {
            return $storageUrl;
        }
    }

    /**
     * Temporary URLs (e.g. for private S3 disks) are also routed through
     * the CDN resolver so that signed-URL collections work transparently
     * when switching from S3 to CDN-backed storage.
     */
    public function getTemporaryUrl(\DateTimeInterface $expiration, array $options = []): string
    {
        $storageUrl = parent::getTemporaryUrl($expiration, $options);

        try {
            /** @var MediaUrlResolver $resolver */
            $resolver = app(MediaUrlResolver::class);

            $ttl = max(0, (int) now()->diffInSeconds($expiration));

            $accept = request()?->header('Accept', '') ?? '';

            return $resolver->resolve(
                media: $this->media,
                storageUrl: $storageUrl,
                conversion: $this->conversion?->getName(),
                hints: $accept !== '' ? ['accept' => $accept] : [],
            );
        } catch (\Throwable) {
            return $storageUrl;
        }
    }
}
