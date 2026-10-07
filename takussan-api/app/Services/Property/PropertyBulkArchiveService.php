<?php

namespace App\Services\Property;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-074 — archive a batch of properties.
 *
 * Behavior:
 *  - Splits the input ids into `authorized` / `failed` based on the
 *    `update` policy check. `failed` entries never touch the DB.
 *  - Writes exactly what the unitary `PUT …/status=archived` writes
 *    (`PropertyPublication::archivedAttributes()`, verif-591 M3 —
 *    `published_at` was left in place) on every authorized id, inside
 *    a single transaction. If any
 *    update throws mid-flight the whole batch is rolled back and the
 *    failure is reported.
 *  - Emits an `property.archived_bulk` activity entry per archived row
 *    so the journal (TCK-018) can display them.
 */
class PropertyBulkArchiveService
{
    private readonly PropertyPublication $publication;

    /** `new PropertyBulkArchiveService` reste valide (TCK-074) : la publication se résout seule. */
    public function __construct(?PropertyPublication $publication = null)
    {
        $this->publication = $publication ?? new PropertyPublication;
    }

    /**
     * @param  int[]  $propertyIds
     * @return array{archived: int, failed: array<int, array{id: int, reason: string}>, archived_ids: int[]}
     */
    public function archive(array $propertyIds, User $actor, ?string $reason = null): array
    {
        $propertyIds = array_values(array_unique(array_map('intval', $propertyIds)));
        if (empty($propertyIds)) {
            return ['archived' => 0, 'failed' => [], 'archived_ids' => []];
        }

        /** @var Collection<int, Property> $properties */
        $properties = Property::query()->whereIn('id', $propertyIds)->get();
        $foundIds = $properties->pluck('id')->all();

        $failed = [];
        foreach ($propertyIds as $id) {
            if (! in_array($id, $foundIds, true)) {
                $failed[] = ['id' => $id, 'reason' => 'not_found'];
            }
        }

        /** @var array<int, Property> $authorized */
        $authorized = [];
        foreach ($properties as $property) {
            if (! $actor->can('update', $property)) {
                $failed[] = ['id' => $property->id, 'reason' => 'forbidden'];

                continue;
            }

            if ($property->status === PropertyStatus::Archived) {
                $failed[] = ['id' => $property->id, 'reason' => 'already_archived'];

                continue;
            }

            $authorized[] = $property;
        }

        $archivedIds = [];
        if (! empty($authorized)) {
            DB::transaction(function () use ($authorized, $actor, $reason, &$archivedIds): void {
                foreach ($authorized as $property) {
                    // Capture the prior status BEFORE `save()` — Eloquent's
                    // `finishSave()` calls `syncOriginal()` on success, which
                    // would otherwise overwrite the original with 'archived'
                    // and make the audit entry meaningless.
                    $previousStatus = $property->status?->value;

                    $property->forceFill($this->publication->archivedAttributes())->save();

                    activity('Property')
                        ->performedOn($property)
                        ->causedBy($actor)
                        ->withProperties([
                            'reason' => $reason,
                            'previous_status' => $previousStatus,
                        ])
                        ->event('property.archived_bulk')
                        ->log('property.archived_bulk');

                    $archivedIds[] = $property->id;
                }
            });
        }

        return [
            'archived' => count($archivedIds),
            'failed' => $failed,
            'archived_ids' => $archivedIds,
        ];
    }
}
