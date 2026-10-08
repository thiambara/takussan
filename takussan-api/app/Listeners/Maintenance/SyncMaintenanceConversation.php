<?php

namespace App\Listeners\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Messaging\GroupConversationService;
use App\Services\Messaging\SystemMessageFactory;

/**
 * TCK-592 (P19) — le fil de discussion d'une intervention.
 *
 * Une conversation pouvait porter `maintenance_request_id`, mais rien ne la créait. Désormais :
 *
 *  - **première assignation** : conversation de groupe créée par `GroupConversationService` — le
 *    donneur d'ordre qui assigne (à défaut, le bailleur du bien), le prestataire, le demandeur ;
 *  - **réassignation** : le prestataire précédent quitte le fil, le nouveau y entre — une seule
 *    conversation par intervention, jamais une seconde ;
 *  - **chaque `MaintenanceStatusChanged`** : un avis système portant le CODE de l'étape
 *    (`SystemMessageFactory::maintenance()`), que le front rend dans la langue du lecteur.
 *
 * Synchrone, à dessein : la fiche renvoyée par l'assignation doit pouvoir proposer « Discuter ».
 * L'événement est `ShouldDispatchAfterCommit` : la demande est écrite quand ceci s'exécute.
 */
class SyncMaintenanceConversation
{
    public function __construct(
        private readonly GroupConversationService $groups,
        private readonly SystemMessageFactory $systemMessages,
    ) {}

    public function handle(MaintenanceStatusChanged $event): void
    {
        $mr = $event->maintenanceRequest->loadMissing(['property', 'assignee', 'requester']);
        $conversation = self::conversationFor($mr);

        if ($conversation === null) {
            if ($event->cause !== MaintenanceStatusChanged::CAUSE_ASSIGNED || $mr->assignee === null) {
                return;
            }
            $conversation = $this->open($mr, $event->actor);
        } elseif (in_array($event->cause, [
            MaintenanceStatusChanged::CAUSE_ASSIGNED,
            MaintenanceStatusChanged::CAUSE_UNASSIGNED,
            MaintenanceStatusChanged::CAUSE_DECLINED,
        ], true)) {
            $this->swapProvider($conversation, $mr, $event);
        }

        $this->systemMessages->maintenance($conversation, $event->actor, [
            'maintenance_request_id' => $mr->id,
            'cause' => $event->cause,
            'from' => $event->from?->value,
            'status' => $event->to->value,
            'provider_name' => $this->nameOf(in_array($event->cause, [MaintenanceStatusChanged::CAUSE_ASSIGNED, MaintenanceStatusChanged::CAUSE_ACCEPTED], true)
                ? $mr->assignee
                : User::query()->find($event->context['previous_assignee_id'] ?? $mr->assigned_to)),
        ]);
    }

    public static function conversationFor(MaintenanceRequest $mr): ?Conversation
    {
        return Conversation::query()
            ->where('maintenance_request_id', $mr->id)
            ->where('type', ConversationType::Group->value)
            ->oldest('id')
            ->first();
    }

    private function open(MaintenanceRequest $mr, ?User $actor): Conversation
    {
        $creator = $actor ?? $mr->property?->owner ?? $mr->assignee;

        return $this->groups->create(
            $creator,
            $mr->title,
            array_values(array_filter([$mr->assigned_to, $mr->requester_id])),
            $mr->property_id,
            $mr->lease_id,
            $mr->id,
        );
    }

    private function swapProvider(Conversation $conversation, MaintenanceRequest $mr, MaintenanceStatusChanged $event): void
    {
        $actor = $event->actor ?? $mr->property?->owner;
        $previous = User::query()->find($event->context['previous_assignee_id'] ?? null);

        // Le prestataire sortant quitte le fil — sauf s'il y est à un autre titre (demandeur, ou
        // créateur et seul administrateur du groupe).
        if ($previous !== null && $previous->id !== $mr->requester_id && $previous->id !== $mr->assigned_to) {
            $isActive = $conversation->participants()->where('users.id', $previous->id)->wherePivotNull('left_at')->exists();
            $isCreator = (int) $conversation->created_by === $previous->id;
            if ($isActive && ! $isCreator && $actor !== null) {
                $this->groups->removeParticipant($conversation, $actor, $previous);
            }
        }

        if ($mr->assignee !== null && $actor !== null) {
            $this->groups->addParticipants($conversation, $actor, [$mr->assignee->id]);
        }
    }

    private function nameOf(?User $user): ?string
    {
        if ($user === null) {
            return null;
        }

        return trim($user->first_name.' '.$user->last_name) ?: $user->username;
    }
}
