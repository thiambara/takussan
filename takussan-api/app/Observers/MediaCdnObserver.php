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
        $urls = $this->snapshotUrls($media);

        if (! empty($urls)) {
            PurgeCdnCacheJob::dispatch($urls);
        }
    }

    /**
     * When a media item is updated (e.g. file replaced) purge the old cached
     * variant.  The new URL will be populated after the conversion pipeline.
     */
    public function updated(Media $media): void
    {
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
