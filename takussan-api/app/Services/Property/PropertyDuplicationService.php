<?php

namespace App\Services\Property;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TCK-074 — clone a Property into a fresh draft.
 *
 * What is copied:
 *  - Fillable scalars (title, price, type, contract_type, …)
 *  - Metadata JSON
 *  - Tags (morphToMany pivot)
 *  - Amenities / characteristics (embedded in metadata on this codebase)
 *  - Address (new row, same data)
 *  - Collaborators (optional, `copy_collaborators=true`)
 *  - Media collection `photos` via spatie/laravel-medialibrary `copy()`
 *    (optional, `copy_media=true`).
 *
 * What is NOT copied:
 *  - `reference_number`, `slug` — regenerated via the boot hook.
 *  - `published_at`, `archived_at` — cleared.
 *  - Counters: `views_count`, `favorites_count`, `visits_count`,
 *    `reviews_count`, `average_rating`.
 *  - History / transactional data: price history, bookings, leases,
 *    visits, reviews, maintenance requests, documents.
 *
 * The new property is always created in `draft` / `private`.
 */
class PropertyDuplicationService
{
    /**
     * @param  array{copy_media?: bool, copy_collaborators?: bool, title_suffix?: ?string}  $options
     */
    public function duplicate(Property $source, User $actor, array $options = []): Property
    {
        $copyMedia = (bool) ($options['copy_media'] ?? false);
        $copyCollaborators = (bool) ($options['copy_collaborators'] ?? false);
        $titleSuffix = $options['title_suffix'] ?? ' (copie)';

        $clone = DB::transaction(function () use ($source, $actor, $titleSuffix, $copyCollaborators) {
            /** @var Property $clone */
            $clone = $source->replicate([
                'reference_number',
                'slug',
                'published_at',
                'archived_at',
                'views_count',
                'favorites_count',
                'visits_count',
                'reviews_count',
                'average_rating',
                'deleted_at',
            ]);

            $clone->title = trim(((string) $source->title).($titleSuffix ?? ''));
            $clone->status = PropertyStatus::Draft;
            $clone->visibility = PropertyVisibility::Private;
            $clone->user_id = $actor->id;
            $clone->save();

            if ($source->address) {
                $clone->address()->create($source->address->only([
                    'street', 'neighborhood', 'city', 'region', 'country',
                    'latitude', 'longitude',
                ]));
            }

            // Tags pivot — morphToMany, sync by id.
            $tagIds = $source->tags()->pluck('tags.id')->all();
            if (! empty($tagIds)) {
                $clone->tags()->sync($tagIds);
            }

            if ($copyCollaborators) {
                foreach ($source->collaborators as $collab) {
                    $clone->collaborators()->create($collab->only([
                        'user_id', 'role', 'commission_share', 'metadata',
                    ]));
                }
            }

            activity('Property')
                ->performedOn($clone)
                ->causedBy($actor)
                ->withProperties([
                    'source_id' => $source->id,
                    'source_reference' => $source->reference_number,
                ])
                ->event('property.duplicated')
                ->log('property.duplicated');

            return $clone;
        });

        // Media copy runs OUTSIDE the transaction: spatie's `copy()` writes
        // files to disk synchronously and triggers conversions; we don't
        // want those side effects rolled back by a DB failure, and we
        // don't want a slow copy to hold a transaction open.
        if ($copyMedia) {
            foreach ($source->getMedia('photos') as $media) {
                $media->copy($clone, 'photos');
            }
        }

        return $clone->refresh();
    }
}
