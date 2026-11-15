<?php

namespace App\Services\Maintenance;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\MaintenanceRescheduleRequest;
use App\Models\User;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Model\NotificationService;
use Carbon\CarbonInterface;
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

        $this->notify($mr->refresh(), $requester, count($slots));

        return $created;
    }

    private function notify(MaintenanceRequest $mr, User $author, int $slots): void
    {
        $mr->loadMissing(['property.agency', 'assignee']);

        $provider = $mr->assignee;
        if ($provider !== null && $mr->property?->agency_id !== null && ! $this->eligibility->isAssignable($provider, $mr->property)) {
            $provider = null;
        }

        $recipients = collect([$provider, ...$this->participants->principals($mr)])
            ->filter(fn (?User $user): bool => $user !== null && $user->id !== $author->id)
            ->unique('id');

        foreach ($recipients as $recipient) {
            $this->notifications->send(
                $recipient,
                NotificationCode::MaintenanceRescheduleRequested,
                ['request' => (string) $mr->title, 'slots' => $slots],
                NotificationTarget::of('maintenance', $mr->id),
            );
        }
    }
}
