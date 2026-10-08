<?php

namespace App\Listeners\Maintenance;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Maintenance\MaintenanceParticipants;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * TCK-592 (C7, P4, P13, O14) — chacun apprend ce qui le regarde, dans SA langue.
 *
 * `transition()`, `complete()` et l'assignation ne notifiaient personne ; les seules notifications
 * du domaine étaient en prose française écrite en dur, et le devis allait au demandeur (le
 * locataire : il recevait le prix négocié, l'agence rien).
 *
 *  - **prestataire** : assignation, retrait, demande de devis, décision sur son devis, issue de la
 *    clôture (confirmée, contestée, automatique), annulation ;
 *  - **demandeur** : chaque étape visible ({@see self::REQUESTER_STEPS}), avec le passage prévu
 *    (`scheduled_at`) — **jamais** un montant ni une étape de devis ;
 *  - **donneurs d'ordre** (bailleur + équipe) : acceptation, refus avec son motif, devis soumis,
 *    fin des travaux, issue de la clôture, annulation.
 *
 * L'auteur du geste n'est jamais notifié de son propre geste ; un destinataire qui tient deux rôles
 * ne reçoit qu'une notification, celle du premier rôle listé.
 */
class NotifyMaintenanceParticipants implements ShouldQueue
{
    /** Les étapes que le demandeur voit passer. Les états de devis n'en sont pas (P13). */
    private const REQUESTER_STEPS = ['acknowledged', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled'];

    public function __construct(
        private readonly NotificationService $notifications,
        private readonly MaintenanceParticipants $participants,
    ) {}

    public function handle(MaintenanceStatusChanged $event): void
    {
        $mr = $event->maintenanceRequest->loadMissing(['property.agency', 'property.owner', 'assignee', 'requester']);

        $sends = [];
        foreach ($this->plan($event, $mr) as [$recipients, $key, $extra]) {
            foreach ($recipients as $recipient) {
                if (! $recipient instanceof User
                    || $recipient->id === $event->actor?->id
                    || isset($sends[$recipient->id])) {
                    continue;
                }
                $sends[$recipient->id] = [$recipient, $key, $extra];
            }
        }

        foreach ($sends as [$recipient, $key, $extra]) {
            $this->send($recipient, $key, $extra, $mr, $event);
        }
    }

    /**
     * @return list<array{0: iterable<User|null>, 1: string, 2: array<string, mixed>}>
     */
    private function plan(MaintenanceStatusChanged $event, MaintenanceRequest $mr): array
    {
        $provider = [$mr->assignee];
        $requester = [$mr->requester];
        $principals = fn () => $this->participants->principals($mr);
        $previous = fn () => [User::query()->find($event->context['previous_assignee_id'] ?? null)];
        $step = fn (string $status) => [$requester, 'step', ['status_key' => $status]];

        return match ($event->cause) {
            MaintenanceStatusChanged::CAUSE_ASSIGNED => [
                [$provider, 'assigned', []],
                [$previous(), 'unassigned', []],
                $step('assigned'),
            ],
            MaintenanceStatusChanged::CAUSE_UNASSIGNED => [[$previous(), 'unassigned', []]],
            MaintenanceStatusChanged::CAUSE_ACCEPTED => [[$principals(), 'accepted', []]],
            MaintenanceStatusChanged::CAUSE_DECLINED => [
                [$principals(), 'declined', ['reason' => (string) ($event->context['reason'] ?? '')]],
            ],
            MaintenanceStatusChanged::CAUSE_QUOTE_REQUESTED => [[$provider, 'quote_requested', []]],
            MaintenanceStatusChanged::CAUSE_QUOTE_SUBMITTED => [[$principals(), 'quote_submitted', []]],
            MaintenanceStatusChanged::CAUSE_QUOTE_AWAITING_OWNER => [[[$mr->property?->owner], 'quote_awaiting_owner', []]],
            MaintenanceStatusChanged::CAUSE_QUOTE_APPROVED => [[$provider, 'quote_approved', []]],
            MaintenanceStatusChanged::CAUSE_QUOTE_REJECTED => [
                [$provider, 'quote_rejected', ['reason' => (string) ($event->context['reason'] ?? '')]],
            ],
            MaintenanceStatusChanged::CAUSE_COMPLETED => [[$principals(), 'completed', []], $step('completed')],
            MaintenanceStatusChanged::CAUSE_CONFIRMED => [[$provider, 'confirmed', []], [$principals(), 'confirmed', []]],
            MaintenanceStatusChanged::CAUSE_CONTESTED => [
                [$provider, 'contested', ['comment' => (string) ($event->context['comment'] ?? '')]],
                [$principals(), 'contested', ['comment' => (string) ($event->context['comment'] ?? '')]],
            ],
            MaintenanceStatusChanged::CAUSE_AUTO_CLOSED => [
                [$provider, 'auto_closed', ['days' => (int) ($event->context['days'] ?? 7)]],
                [$principals(), 'auto_closed', ['days' => (int) ($event->context['days'] ?? 7)]],
                [$requester, 'auto_closed', ['days' => (int) ($event->context['days'] ?? 7)]],
            ],
            default => $this->planTransition($event, $provider, $principals, $step),
        };
    }

    /**
     * Le statut générique (`PUT …/status`, démarrage) : seuls l'annulation et la fin intéressent
     * le prestataire et les donneurs d'ordre ; le demandeur voit ses étapes.
     */
    private function planTransition(MaintenanceStatusChanged $event, array $provider, \Closure $principals, \Closure $step): array
    {
        $plan = match ($event->to) {
            MaintenanceStatus::Cancelled => [[$provider, 'cancelled', []], [$principals(), 'cancelled', []]],
            MaintenanceStatus::Completed => [[$principals(), 'completed', []]],
            default => [],
        };

        if ($event->from !== $event->to && in_array($event->to->value, self::REQUESTER_STEPS, true)) {
            $plan[] = $step($event->to->value);
        }

        return $plan;
    }

    /**
     * TCK-588 (ADR-0032) — un code et des paramètres bruts : le texte se rend dans la langue du
     * destinataire, à l'émission (ligne stockée, e-mail) comme dans la cloche.
     *
     * @param  array<string, mixed>  $extra
     */
    private function send(User $recipient, string $key, array $extra, MaintenanceRequest $mr, MaintenanceStatusChanged $event): void
    {
        $params = ['request' => (string) $mr->title];

        $code = match ($key) {
            'assigned' => NotificationCode::MaintenanceAssigned,
            'unassigned' => NotificationCode::MaintenanceUnassigned,
            'accepted' => NotificationCode::MaintenanceAccepted,
            'declined' => NotificationCode::MaintenanceDeclined,
            'quote_requested' => NotificationCode::MaintenanceQuoteRequested,
            'quote_submitted' => NotificationCode::MaintenanceQuoteSubmitted,
            'quote_awaiting_owner' => NotificationCode::MaintenanceQuoteAwaitingOwner,
            'quote_approved' => NotificationCode::MaintenanceQuoteApproved,
            'quote_rejected' => NotificationCode::MaintenanceQuoteRejected,
            'completed' => NotificationCode::MaintenanceCompleted,
            'confirmed' => NotificationCode::MaintenanceConfirmed,
            'contested' => NotificationCode::MaintenanceContested,
            'auto_closed' => NotificationCode::MaintenanceAutoClosed,
            'cancelled' => NotificationCode::MaintenanceCancelled,
            'step' => $this->stepCode((string) $extra['status_key'], $mr, $params),
        };

        foreach (array_keys($code->params()) as $name) {
            $params[$name] ??= match ($name) {
                'property' => (string) $mr->property?->title,
                'provider' => $this->nameOf($mr->assignee ?? $event->actor),
                'amount' => NotificationRenderer::money($mr->quote_amount, $mr->quote_currency),
                default => $extra[$name] ?? '',
            };
        }

        $this->notifications->send($recipient, $code, $params, NotificationTarget::of('maintenance', $mr->id));
    }

    /**
     * L'étape que le demandeur voit passer : un code par statut, et sa variante datée quand un
     * passage est prévu et que l'intervention n'est pas finie.
     *
     * @param  array<string, mixed>  $params
     */
    private function stepCode(string $status, MaintenanceRequest $mr, array &$params): NotificationCode
    {
        $scheduled = $mr->scheduled_at !== null && ! in_array($status, ['closed', 'cancelled', 'completed'], true);
        if ($scheduled) {
            $params['scheduled_at'] = $mr->scheduled_at->toIso8601String();
        }

        return NotificationCode::from('maintenance.step_'.$status.($scheduled ? '_scheduled' : ''));
    }

    private function nameOf(?User $user): string
    {
        if ($user === null) {
            return '';
        }

        return trim($user->first_name.' '.$user->last_name) ?: (string) $user->username;
    }
}
