<?php

namespace App\Observers;

use App\Jobs\Media\PurgeCdnCacheJob;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class MediaCdnObserver
{
    /**
     * Snapshot all CDN URLs before the Media row is deleted so the purge job
     * can still reference them after the record has been removed from the DB.
     */
    public function deleting(Media $media): void
    {
        if (! config('cdn.enabled')) {
            return;
        }

        $urls = $this->snapshotUrls($media);

        if (! empty($urls)) {
            PurgeCdnCacheJob::dispatch($urls);
        }
    }

    /**
     * When the underlying file changes (replaced upload, disk move) we must
     * purge the previous CDN-cached variant. Pure metadata mutations
     * (custom_properties, order_column, etc.) leave the URL intact and
     * must not trigger a purge — otherwise reordering a gallery would
     * flood the purge API.
     */
    public function updated(Media $media): void
    {
        if (! config('cdn.enabled')) {
            return;
        }

        $touchesFile = $media->wasChanged(['file_name', 'disk', 'conversions_disk', 'mime_type', 'size']);

        if (! $touchesFile) {
            return;
        }

        $urls = $this->snapshotUrls($media);

        if (! empty($urls)) {
            PurgeCdnCacheJob::dispatch($urls);
        }
    }

    /**
     * Build the list of CDN URLs to purge from a Media row.
     *
     * We call getUrl() for the original and for every generated conversion.
     * This snapshot is taken while the record still exists (before deletion).
     *
     * @return array<string>
     */
    private function snapshotUrls(Media $media): array
    {
        $urls = [];

        try {
            $urls[] = $media->getUrl();

            foreach (array_keys($media->generated_conversions ?? []) as $conversion) {
                $urls[] = $media->getUrl((string) $conversion);
            }
        } catch (\Throwable) {
            // URL generation failure must never block deletion.
        }

        return array_values(array_filter($urls));
    }
}
