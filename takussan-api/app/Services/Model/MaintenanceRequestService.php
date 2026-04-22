<?php

namespace App\Services\Model;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Http\UploadedFile;

class MaintenanceRequestService
{
    /**
     * Valid status transitions. `new`/`open` is the entry state; `acknowledged`
     * and `assigned` are intermediate states handled via the generic update
     * endpoint (or assignation); here we model the lifecycle:
     *   open → in_progress → completed (alias: resolved)
     *   open → cancelled
     *   in_progress → cancelled
     */
    public const TRANSITIONS = [
        'open' => ['acknowledged', 'assigned', 'in_progress', 'cancelled'],
        'acknowledged' => ['assigned', 'in_progress', 'cancelled'],
        'assigned' => ['in_progress', 'cancelled'],
        'in_progress' => ['completed', 'cancelled'],
        'completed' => ['closed'],
        'closed' => [],
        'cancelled' => [],
    ];

    public function canTransitionTo(MaintenanceStatus $from, MaintenanceStatus $to): bool
    {
        $allowed = self::TRANSITIONS[$from->value] ?? [];

        return in_array($to->value, $allowed, true);
    }

    public function transition(MaintenanceRequest $mr, MaintenanceStatus $to): MaintenanceRequest
    {
        $current = $mr->status ?? MaintenanceStatus::Open;

        // Idempotent when already in the target state.
        if ($current === $to) {
            return $mr;
        }

        abort_unless(
            $this->canTransitionTo($current, $to),
            422,
            "Transition from {$current->value} to {$to->value} is not allowed."
        );

        $mr->status = $to;

        if ($to === MaintenanceStatus::InProgress && $mr->started_at === null) {
            $mr->started_at = now();
        }

        if ($to === MaintenanceStatus::Completed && $mr->completed_at === null) {
            $mr->completed_at = now();
        }

        $mr->save();

        return $mr->refresh();
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<int,UploadedFile>  $photos
     */
    public function complete(MaintenanceRequest $mr, array $data, array $photos = []): MaintenanceRequest
    {
        $current = $mr->status ?? MaintenanceStatus::Open;

        abort_unless(
            $this->canTransitionTo($current, MaintenanceStatus::Completed),
            422,
            "Transition from {$current->value} to completed is not allowed."
        );

        $mr->status = MaintenanceStatus::Completed;
        $mr->completed_at = now();

        if (array_key_exists('resolution_notes', $data) && $data['resolution_notes'] !== null) {
            $mr->resolution_notes = $data['resolution_notes'];
        }

        $cost = $data['cost'] ?? $data['actual_cost'] ?? null;
        if ($cost !== null) {
            $mr->actual_cost = $cost;
        }

        $mr->save();

        foreach ($photos as $photo) {
            $mr->addMedia($photo)->toMediaCollection('completion_photos');
        }

        return $mr->refresh();
    }

    /**
     * @param  array<int,UploadedFile>  $photos
     */
    public function addPhotos(MaintenanceRequest $mr, array $photos, string $collection = 'photos'): array
    {
        $added = [];
        foreach ($photos as $photo) {
            $media = $mr->addMedia($photo)->toMediaCollection($collection);
            $added[] = [
                'id' => $media->id,
                'url' => $media->getUrl(),
                'collection' => $collection,
            ];
        }

        return $added;
    }
}
