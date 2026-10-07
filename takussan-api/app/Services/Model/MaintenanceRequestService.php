<?php

namespace App\Services\Model;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\UploadedFile;

class MaintenanceRequestService
{
    public function __construct(
        protected PrivateMediaAccess $privateMedia,
        protected MaintenanceStateMachine $machine,
    ) {}

    /**
     * TCK-592 — la table vivait ici, et une seconde dans `MaintenanceQuoteWorkflow`. Les deux
     * lisent désormais {@see MaintenanceStateMachine::TRANSITIONS}.
     */
    public function canTransitionTo(MaintenanceStatus $from, MaintenanceStatus $to): bool
    {
        return $this->machine->canTransition($from, $to);
    }

    public function transition(MaintenanceRequest $mr, MaintenanceStatus $to): MaintenanceRequest
    {
        $current = $mr->status ?? MaintenanceStatus::Open;

        // Idempotent when already in the target state.
        if ($current === $to) {
            return $mr;
        }

        $this->assertTransition($current, $to);

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
     * TCK-592 — un refus de la TABLE est un 422 ; un refus de l'ACTEUR est un 403, rendu avant
     * d'arriver ici par `MaintenanceRequestPolicy::transitionTo()`.
     */
    public function assertTransition(MaintenanceStatus $from, MaintenanceStatus $to): void
    {
        abort_unless(
            $this->machine->canTransition($from, $to),
            422,
            __('maintenance.errors.transition_not_allowed', ['from' => $from->value, 'to' => $to->value]),
        );
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<int,UploadedFile>  $photos
     */
    public function complete(MaintenanceRequest $mr, array $data, array $photos = []): MaintenanceRequest
    {
        $current = $mr->status ?? MaintenanceStatus::Open;

        $this->assertTransition($current, MaintenanceStatus::Completed);

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
                // URL d'API signée (TCK-538) : `photos` et `completion_photos` sont privées,
                // `getUrl()` ne serait servie par personne. Émise dans une réponse autorisée.
                'url' => $this->privateMedia->signedUrl($media),
                'collection' => $collection,
            ];
        }

        return $added;
    }
}
