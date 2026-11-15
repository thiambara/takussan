<?php

namespace App\Services\Maintenance;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Policies\MaintenanceRequestPolicy;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Property\BailleurDuBien;
use App\Services\Property\PrimaryPropertyContact;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2786 — « Relancer le bailleur » : une intervention attend sa décision (`awaiting_owner`,
 * ADR-0037), l'agence le lui rappelle PAR TAKUSSAN, sans jamais servir son contact (décision n° 2
 * de TCK-2653). Le bailleur reçoit `maintenance.owner_reminder` par ses canaux préférés, avec la
 * même cible que `maintenance_quote.awaiting_owner` : la décision du devis.
 *
 * Qui relance : {@see MaintenanceRequestPolicy::remindOwner()}. Ici, sous le verrou de la ligne
 * (deux relances simultanées n'en font qu'une), dans cet ordre :
 *   1. seulement en `awaiting_owner` — sinon 409 `maintenance.not_awaiting_owner` ;
 *   2. un bailleur parti, suspendu (TCK-2753, `isBlockedOwnerAt`) ou au compte injoignable n'est pas
 *      relancé — 409 `maintenance.owner_unavailable`, et le journal le dit (`owner_unavailable`) ;
 *   3. une relance par demande et par {@see self::COOLDOWN_HOURS} heures — sinon 409
 *      `maintenance.owner_reminder_too_soon` avec `available_at`.
 * Le patron est celui de la relance d'activation du radar (`RadarActivationReminders`) : la cadence
 * jugée sur la ligne verrouillée, l'instant permis dans la réponse.
 */
class OwnerReminder
{
    public const COOLDOWN_HOURS = 24;

    public function __construct(
        private readonly MaintenanceRequestService $requests,
        private readonly NotificationService $notifications,
        private readonly MaintenanceJournal $journal,
    ) {}

    public function remind(MaintenanceRequest $mr, User $actor): MaintenanceRequest
    {
        /** @var array{0: bool, 1: ?User} $issue */
        $issue = DB::transaction(function () use ($mr): array {
            $fresh = $this->requests->lockFresh($mr);

            abort_code_unless($fresh->status === MaintenanceStatus::AwaitingOwner, 409, 'maintenance.not_awaiting_owner');

            $owner = $this->reachableOwner($fresh);
            if ($owner === null) {
                return [false, null];
            }

            $availableAt = $this->availableAt($fresh);
            abort_code_if($availableAt !== null, 409, 'maintenance.owner_reminder_too_soon', [
                'available_at' => BaseResource::instantOnWire($availableAt),
            ]);

            $fresh->owner_reminded_at = now();
            $fresh->save();

            return [true, $owner];
        });

        [$sent, $owner] = $issue;
        $mr->refresh();

        if (! $sent) {
            // Hors de la transaction : le refus qui suit l'annulerait. Une seule entrée par refus
            // consécutif — le journal le dit, il ne le répète pas à chaque essai.
            if ($this->journal->entriesOf($mr)->reorder()->orderByDesc('created_at')->orderByDesc('id')->value('event') !== MaintenanceJournal::OWNER_UNAVAILABLE) {
                $this->journal->record($mr, MaintenanceJournal::OWNER_UNAVAILABLE, $actor);
            }
            abort_code(409, 'maintenance.owner_unavailable');
        }

        $mr->loadMissing('property');
        $this->notifications->send($owner, NotificationCode::MaintenanceOwnerReminder, [
            'request' => (string) $mr->title,
            'amount' => NotificationRenderer::money($mr->quote_amount, $mr->quote_currency),
        ], NotificationTarget::of('maintenance', $mr->id));

        $this->journal->record($mr, MaintenanceJournal::OWNER_REMINDED, $actor);

        return $mr;
    }

    /**
     * La prochaine relance permise, ou `null` si elle l'est déjà. Jugée sur la colonne seule : sans
     * requête, lisible par la ressource.
     */
    public function availableAt(MaintenanceRequest $mr): ?CarbonInterface
    {
        $next = $mr->owner_reminded_at?->copy()->addHours(self::COOLDOWN_HOURS);

        return $next !== null && $next->isFuture() ? $next : null;
    }

    /** Le geste est-il possible maintenant (statut, cadence, bailleur joignable) ? L'acteur se juge à part. */
    public function possible(MaintenanceRequest $mr): bool
    {
        return $mr->status === MaintenanceStatus::AwaitingOwner
            && $this->availableAt($mr) === null
            && $this->reachableOwner($mr) !== null;
    }

    /**
     * Le bailleur du bien au sens de {@see BailleurDuBien} (jamais l'agent qui a saisi le bien,
     * TCK-1720), s'il peut encore décider : ni parti ni suspendu dans l'agence (TCK-2753), et
     * joignable (un compte bloqué ou supprimé ne reçoit rien, TCK-1350 — on ne note pas une relance
     * qui ne part pas).
     */
    private function reachableOwner(MaintenanceRequest $mr): ?User
    {
        $property = $mr->property;
        $owner = $property?->owner;
        if ($property === null || $owner === null || ! BailleurDuBien::est($owner, $property->user_id, $property->agency_id)) {
            return null;
        }

        if ($property->agency_id !== null && $owner->isBlockedOwnerAt((int) $property->agency_id)) {
            return null;
        }

        return PrimaryPropertyContact::joignable($owner) ? $owner : null;
    }
}
