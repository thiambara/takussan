<?php

namespace App\Services\Document;

use App\Models\Document;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\UploadedFile;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Manages the `versions` media collection on a Document.
 *
 * Invariants enforced:
 *  - Exactly one version has custom_properties.is_active = true at any time.
 *  - version_number in custom_properties tracks the monotone sequence (1 = first upload).
 *  - Soft-cap: when count > 20 the oldest version is deleted from disk but its
 *    ActivityLog entry (event = document.version.purged) remains for 90 days.
 *
 * Implementation note: we query the `media` table directly via Media::query() instead of
 * $document->getMedia() to avoid Spatie's in-memory collection cache, which would return
 * stale results after multiple sequential uploads within the same request lifecycle.
 */
class DocumentVersionService
{
    public const COLLECTION = 'versions';

    public const VERSION_CAP = 20;

    /**
     * Upload a new version, deactivate the previous active one, log the event.
     *
     * @return Media The newly created media item (active version).
     */
    public function uploadVersion(Document $document, UploadedFile $file, User $actor, ?string $comment = null): Media
    {
        return \DB::transaction(function () use ($document, $file, $actor, $comment): Media {
            // Deactivate previous active version.
            $this->deactivateAll($document);

            // Determine next version number from the DB (not the cached collection).
            $nextVersion = $this->freshVersions($document)->count() + 1;

            /** @var Media $media */
            $media = $document
                ->addMedia($file)
                ->withCustomProperties([
                    'is_active' => true,
                    'version_number' => $nextVersion,
                    'comment' => $comment,
                    'uploaded_by_id' => $actor->id,
                ])
                ->toMediaCollection(self::COLLECTION);

            // Log the upload event.
            activity()
                ->causedBy($actor)
                ->performedOn($document)
                ->withProperties([
                    'version_number' => $nextVersion,
                    'file_name' => $media->file_name,
                    'comment' => $comment,
                    'actor_id' => $actor->id,
                ])
                ->event('document.version.uploaded')
                ->log("Version {$nextVersion} uploaded.");

            // Enforce soft-cap.
            $this->enforceCap($document, $actor);

            return $media->refresh();
        });
    }

    /**
     * Restore an archived version as the active one.
     *
     * @param  int|Media  $version  Either the media ID or the Media model itself.
     */
    public function restoreVersion(Document $document, Media|int $version, User $actor): Media
    {
        $media = ($version instanceof Media)
            ? $version
            : $this->freshVersions($document)->firstWhere('id', $version);

        abort_if($media === null, 404, 'Version not found.');
        abort_if(
            $media->model_id !== $document->id,
            403,
            'Version does not belong to this document.'
        );

        return \DB::transaction(function () use ($document, $media, $actor): Media {
            // Deactivate all, then reactivate the target.
            $this->deactivateAll($document);

            $media->setCustomProperty('is_active', true);
            $media->save();

            $versionNumber = $media->getCustomProperty('version_number');

            activity()
                ->causedBy($actor)
                ->performedOn($document)
                ->withProperties([
                    'version_number' => $versionNumber,
                    'file_name' => $media->file_name,
                    'actor_id' => $actor->id,
                ])
                ->event('document.version.restored')
                ->log("Version {$versionNumber} restored.");

            return $media->refresh();
        });
    }

    /**
     * List all versions ordered by version_number descending (latest first).
     *
     * @return Collection<int, Media>
     */
    public function listVersions(Document $document): Collection
    {
        /** @var Collection<int,Media> */
        return $this->freshVersions($document)
            ->sortByDesc(fn (Media $m) => $m->getCustomProperty('version_number', 0))
            ->values();
    }

    /**
     * Return the currently active media item, or null if none.
     */
    public function activeVersion(Document $document): ?Media
    {
        return $this->freshVersions($document)
            ->first(fn (Media $m) => (bool) $m->getCustomProperty('is_active', false));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Query the media table directly — bypasses the in-memory cache on the model.
     *
     * @return Collection<int, Media>
     */
    private function freshVersions(Document $document): Collection
    {
        return Media::query()
            ->where('model_type', Document::class)
            ->where('model_id', $document->id)
            ->where('collection_name', self::COLLECTION)
            ->get();
    }

    private function deactivateAll(Document $document): void
    {
        foreach ($this->freshVersions($document) as $media) {
            if ($media->getCustomProperty('is_active')) {
                $media->setCustomProperty('is_active', false);
                $media->save();
            }
        }
    }

    private function enforceCap(Document $document, User $actor): void
    {
        $all = $this->freshVersions($document)
            ->sortBy(fn (Media $m) => $m->getCustomProperty('version_number', 0))
            ->values();

        if ($all->count() <= self::VERSION_CAP) {
            return;
        }

        $oldest = $all->first();
        if ($oldest === null) {
            return;
        }

        // Log before deleting (audit trail preserved for 90 days via spatie activitylog).
        activity()
            ->causedBy($actor)
            ->performedOn($document)
            ->withProperties([
                'version_number' => $oldest->getCustomProperty('version_number'),
                'file_name' => $oldest->file_name,
                'actor_id' => $actor->id,
            ])
            ->event('document.version.purged')
            ->log('Version purged: soft-cap of '.self::VERSION_CAP.' exceeded.');

        $oldest->delete();
    }
}
