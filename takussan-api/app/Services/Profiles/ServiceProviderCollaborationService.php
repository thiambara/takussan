<?php

namespace App\Services\Profiles;

use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\User;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * TCK-592 — le cycle de vie d'une collaboration prestataire ↔ agence.
 *
 * Aucun endpoint ne mettait fin à une collaboration (`routes/api/me.php` : lecture seule), et rien ne
 * lisait `ended` : la fin n'existait pas. Trois gestes :
 *
 *  - **pause** (agence) : `paused` + `metadata.paused_by` / `paused_at`. La fin d'onboarding ne lève
 *    JAMAIS une pause qui porte `paused_by` — seule une invitation en attente (`paused` sans
 *    `paused_by`) s'active en fin d'onboarding ;
 *  - **reprise** (agence) : `active`, depuis `paused` ou `ended` — la même ligne, jamais une seconde ;
 *  - **fin** (agence ou prestataire) : `ended` + `ended_at`, **jamais `delete()`**. Les interventions
 *    non démarrées ou en cours du prestataire dans cette agence reviennent au donneur d'ordre.
 */
class ServiceProviderCollaborationService
{
    public function __construct(private readonly MaintenanceRequestService $maintenance) {}

    public function change(ServiceProviderAgencyCollaboration $collaboration, CollaborationStatus $to, User $actor): ServiceProviderAgencyCollaboration
    {
        $from = $collaboration->status;
        if ($from === $to) {
            return $collaboration;
        }

        return match ($to) {
            CollaborationStatus::Paused => $this->pause($collaboration, $actor),
            CollaborationStatus::Active => $this->resume($collaboration, $actor),
            CollaborationStatus::Ended => $this->end($collaboration, $actor),
        };
    }

    public function end(ServiceProviderAgencyCollaboration $collaboration, User $actor): ServiceProviderAgencyCollaboration
    {
        if ($collaboration->status === CollaborationStatus::Ended) {
            return $collaboration;
        }

        $provider = $collaboration->serviceProviderProfile?->user;

        DB::transaction(function () use ($collaboration, $actor, $provider): void {
            $collaboration->forceFill([
                'status' => CollaborationStatus::Ended->value,
                'ended_at' => now()->toDateString(),
            ])->save();

            if ($provider !== null) {
                $this->maintenance->unassignProviderFromAgency($provider, (int) $collaboration->agency_id, $actor);
            }

            $this->log($collaboration, $actor, 'sp_collaboration_ended');
        });

        return $collaboration->refresh();
    }

    private function pause(ServiceProviderAgencyCollaboration $collaboration, User $actor): ServiceProviderAgencyCollaboration
    {
        abort_code_unless(
            $collaboration->status === CollaborationStatus::Active,
            422,
            'maintenance.collaboration_transition',
        );

        $collaboration->forceFill([
            'status' => CollaborationStatus::Paused->value,
            'metadata' => array_merge($collaboration->metadata ?? [], [
                'paused_by' => $actor->id,
                'paused_at' => now()->toIso8601String(),
            ]),
        ])->save();

        $this->log($collaboration, $actor, 'sp_collaboration_paused');

        return $collaboration->refresh();
    }

    /**
     * Reprendre n'active qu'un prestataire réel et actif : une ligne `paused` sans compte est une
     * invitation en attente, qui s'active par la fin d'onboarding et par elle seule.
     */
    private function resume(ServiceProviderAgencyCollaboration $collaboration, User $actor): ServiceProviderAgencyCollaboration
    {
        $profile = $collaboration->serviceProviderProfile;

        abort_code_unless(
            $profile !== null && $profile->user_id !== null && $profile->status === ServiceProviderProfileStatus::Active,
            422,
            'maintenance.collaboration_transition',
        );

        $collaboration->forceFill([
            'status' => CollaborationStatus::Active->value,
            'started_at' => $collaboration->status === CollaborationStatus::Ended
                ? now()->toDateString()
                : ($collaboration->started_at ?? now()->toDateString()),
            'ended_at' => null,
            'metadata' => Arr::except($collaboration->metadata ?? [], ['paused_by', 'paused_at']),
        ])->save();

        $this->log($collaboration, $actor, 'sp_collaboration_resumed');

        return $collaboration->refresh();
    }

    private function log(ServiceProviderAgencyCollaboration $collaboration, User $actor, string $event): void
    {
        activity('ServiceProviderCollaboration')
            ->performedOn($collaboration)
            ->causedBy($actor)
            ->withProperties([
                'agency_id' => $collaboration->agency_id,
                'service_provider_profile_id' => $collaboration->service_provider_profile_id,
                'status' => $collaboration->status?->value,
            ])
            ->event($event)
            ->log($event);
    }
}
