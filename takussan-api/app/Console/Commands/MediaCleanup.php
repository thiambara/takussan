<?php

namespace App\Console\Commands;

use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Removes orphaned media rows older than 24 hours.
 *
 * A media row is considered orphan when its morph target (`model_type`
 * + `model_id`) no longer resolves to an existing record — for example
 * because the owning model was hard-deleted or its class was removed.
 *
 * TCK-750 (P10.04) — a soft-deleted owner is NOT an orphan: its media are purged
 * only {@see self::SOFT_DELETE_RETENTION_DAYS} days after its `deleted_at`, and
 * evidence collections never are. Until then, the default `SoftDeletes` scope made
 * the photos of a property deleted the day before vanish at 03:00.
 *
 * Scheduled daily via routes/console.php.
 */
class MediaCleanup extends Command
{
    public const SOFT_DELETE_RETENTION_DAYS = 90;

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

        if (! in_array(SoftDeletes::class, class_uses_recursive($type), true)) {
            return ! $type::query()->whereKey($id)->exists();
        }

        $owner = $type::withTrashed()->whereKey($id)->first();
        if ($owner === null) {
            return true;
        }
        if (! $owner->trashed() || $this->isEvidence($media, $owner)) {
            return false;
        }

        return $owner->{$owner->getDeletedAtColumn()}->lte(now()->subDays(self::SOFT_DELETE_RETENTION_DAYS));
    }

    /**
     * Les collections de preuve, au sens de TCK-596 (ADR-0042 §1) que tient
     * `MediaController::isLockedEvidence()` pour la route de suppression : le contrat de bail
     * figé, et les photos d'un état des lieux sorti du brouillon. Elles ne partent jamais avec
     * leur modèle supprimé en douceur.
     */
    private function isEvidence(Media $media, object $owner): bool
    {
        if ($owner instanceof Lease) {
            return $media->collection_name === 'signed_contract';
        }
        if ($owner instanceof Inventory) {
            return $media->collection_name === 'room_photos' && $owner->status !== InventoryStatus::Draft;
        }

        return false;
    }
}
