<?php

namespace App\Services\Maintenance;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\MaintenanceRescheduleRequest;
use App\Models\User;
use App\Services\Messaging\FilDeLObjet;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Model\NotificationService;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2917 (ADR-0118 § 3) — le demandeur demande un autre créneau.
 *
 * Sous le verrou de la demande : l'état se rejuge (une demande annulée entre-temps refuse, 422),
 * la demande en attente précédente est remplacée (`superseded`), la nouvelle est écrite. `scheduled_at`
 * n'est jamais touché. Après le commit : les donneurs d'ordre et le prestataire assigné (s'il est encore
 * assignable) sont prévenus (`maintenance.reschedule_requested`), jamais l'auteur.
 */
class RescheduleRequests
{
    public function __construct(
        private readonly MaintenanceRequestService $requests,
        private readonly MaintenanceStateMachine $machine,
        private readonly MaintenanceParticipants $participants,
        private readonly ProviderEligibility $eligibility,
        private readonly NotificationService $notifications,
        private readonly FilDeLObjet $fil, // TCK-2961
    ) {}

    /**
     * @param  list<CarbonInterface>  $slots
     */
    public function request(MaintenanceRequest $mr, User $requester, array $slots, ?string $note): MaintenanceRescheduleRequest
    {
        $created = DB::transaction(function () use ($mr, $requester, $slots, $note): MaintenanceRescheduleRequest {
            $fresh = $this->requests->lockFresh($mr);
            abort_code_if($this->machine->isTerminal($fresh->status), 422, 'maintenance.terminal_request');
            // Le passage a eu lieu : rejugé sous le verrou (la policy le juge avant, hors verrou).
            abort_code_if($fresh->status === MaintenanceStatus::Completed, 422, 'maintenance.terminal_request');

            MaintenanceRescheduleRequest::query()
                ->where('maintenance_request_id', $fresh->id)
                ->where('status', MaintenanceRescheduleRequest::PENDING)
                ->update(['status' => MaintenanceRescheduleRequest::SUPERSEDED, 'resolved_at' => now(), 'updated_at' => now()]);

            $note = $note !== null ? trim($note) : null;

            return MaintenanceRescheduleRequest::query()->create([
                'maintenance_request_id' => $fresh->id,
                'requester_id' => $requester->id,
                'proposed_slots' => array_map(fn (CarbonInterface $slot): string => $slot->toIso8601String(), $slots),
                'note' => $note !== '' ? $note : null,
            ]);
        });

        $mr->refresh();
        $this->notify($mr, $requester, count($slots));

        // TCK-2961 (ADR-0128 § 3) — la demande parle dans le fil de l'intervention ; poser un créneau
        // attend les mêmes personnes que l'avis (donneurs d'ordre, prestataire encore assignable),
        // jamais l'auteur. `slots` : le NOMBRE d'instants proposés (une valeur simple).
        $attendus = $this->recipients($mr, $requester)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $this->fil->parler($mr, 'maintenance.slot_requested', ['slots' => count($slots)],
            fn (User $participant): bool => in_array((int) $participant->getKey(), $attendus, true));

        return $created;
    }

    private function notify(MaintenanceRequest $mr, User $author, int $slots): void
    {
        foreach ($this->recipients($mr, $author) as $recipient) {
            $this->notifications->send(
                $recipient,
                NotificationCode::MaintenanceRescheduleRequested,
                ['request' => (string) $mr->title, 'slots' => $slots],
                NotificationTarget::of('maintenance', $mr->id),
            );
        }
    }

    /**
     * Qui doit poser le créneau : les donneurs d'ordre et le prestataire assigné (s'il est encore
     * assignable), jamais l'auteur de la demande. Lu par l'avis et, depuis TCK-2961, par le fil.
     *
     * @return Collection<int, User>
     */
    private function recipients(MaintenanceRequest $mr, User $author): Collection
    {
        $mr->loadMissing(['property.agency', 'assignee']);

        $provider = $mr->assignee;
        if ($provider !== null && $mr->property?->agency_id !== null && ! $this->eligibility->isAssignable($provider, $mr->property)) {
            $provider = null;
        }

        return collect([$provider, ...$this->participants->principals($mr)])
            ->filter(fn (?User $user): bool => $user !== null && $user->id !== $author->id)
            ->unique('id')
            ->values();
    }
}
