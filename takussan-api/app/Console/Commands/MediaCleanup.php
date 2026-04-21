<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Removes orphaned media rows older than 24 hours.
 *
 * A media row is considered orphan when its morph target (`model_type`
 * + `model_id`) no longer resolves to an existing record — for example
 * because the owning model was hard-deleted or its class was removed.
 *
 * Scheduled daily via routes/console.php.
 */
class MediaCleanup extends Command
{
    protected $signature = 'media:cleanup {--hours=24 : Minimum age in hours before deletion}';

    protected $description = 'Delete orphan media rows older than N hours (default 24).';

    public function handle(): int
    {
        $cutoff = now()->subHours((int) $this->option('hours'));

        $deleted = 0;
        Media::query()
            ->where('created_at', '<=', $cutoff)
            ->chunkById(200, function ($chunk) use (&$deleted) {
                foreach ($chunk as $media) {
                    /** @var Media $media */
                    if ($this->isOrphan($media)) {
                        $media->delete();
                        $deleted++;
                    }
                }
            });

        $this->info("media:cleanup removed {$deleted} orphan media.");

        return self::SUCCESS;
    }

    protected function isOrphan(Media $media): bool
    {
        $type = $media->model_type;
        $id = $media->model_id;

        if (! is_string($type) || $type === '' || ! class_exists($type)) {
            return true;
        }

        if ($id === null) {
            return true;
        }

        // Use withTrashed() if the model uses SoftDeletes — soft-deleted
        // targets still count as orphans for cleanup purposes.
        if (method_exists($type, 'withTrashed')) {
            $exists = $type::withTrashed()
                ->whereKey($id)
                ->whereNull('deleted_at')
                ->exists();

            return ! $exists;
        }

        return ! $type::query()->whereKey($id)->exists();
    }
}
