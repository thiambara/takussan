<?php

namespace App\Services\Visit;

use App\Http\Resources\Bases\BaseResource;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Policies\PropertyVisitPolicy;
use App\Support\Logging\SafeExceptionContext;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-2982 (ADR-0128 § 4, un seul chemin d'écriture) — CONFIRMER une visite, sorti de
 * `PropertyVisitController::confirm` pour que la route et le lien d'action (`GestesParLien`) passent par
 * la même garde et le même service, la politique rejugée au moment du geste, pour le compte qui agit.
 *
 *  1. `PropertyVisitPolicy::update` (la garde de la FormRequest de la route), puis
 *     `PropertyVisitPolicy::peutConfirmer` (TCK-2849 : le bailleur, quand l'agence le lui confie) ;
 *  2. `VisitSchedulingService::confirmOrFail` (source, chevauchement, statut, sous verrou) ;
 *  3. le notifieur, et, confirmée par le bailleur, le journal et l'avis à l'agent.
 *
 * Rend la visite et l'issue du SMS au visiteur (`null` : aucun SMS en jeu).
 */
class ConfirmerUneVisite
{
    public function __construct(
        private readonly VisitSchedulingService $scheduling,
        private readonly VisitNotifier $notifier,
    ) {}

    /** @return array{0: PropertyVisit, 1: bool|null} */
    public function executer(User $acteur, PropertyVisit $visit, ?CarbonInterface $scheduledAt = null): array
    {
        Gate::forUser($acteur)->authorize('update', $visit);
        abort_code_unless(PropertyVisitPolicy::peutConfirmer($acteur, $visit), 403, 'visit.staff_only');
        $parLeBailleur = ! PropertyVisitPolicy::agitPourLeBien($acteur, $visit);
        $avant = $visit->scheduled_at;

        $visit = $this->scheduling->confirmOrFail($visit, $scheduledAt);
        $visit->load('property', 'visitor');

        $sms = $this->notifier->confirmed($visit, $acteur);
        if ($parLeBailleur) {
            $this->confirmeeParLeBailleur($visit, $acteur, $avant);
        }

        return [$visit, $sms];
    }

    /**
     * TCK-2849 (ADR-0112 § 4 et § 5) — une visite confirmée par le BAILLEUR au titre du réglage de
     * l'agence : l'agent attribué l'apprend, avec le nom du bailleur (à défaut d'agent joignable, le
     * repli des avis de l'agence), et le journal nomme le bailleur comme auteur. Un avis qui échoue ne
     * défait pas la confirmation.
     */
    public function confirmeeParLeBailleur(PropertyVisit $visit, User $bailleur, ?\DateTimeInterface $avant): void
    {
        $nouveauCreneau = $avant !== null && $visit->scheduled_at !== null
            && ! $visit->scheduled_at->equalTo($avant);

        activity()
            ->performedOn($visit)
            ->causedBy($bailleur)
            ->withProperties([
                // L'agence du bien : `PropertyVisit` ne porte pas d'`agency_id` (AuditAgencyResolver).
                'agency_id' => $visit->property?->agency_id,
                // TCK-2943 — la forme d'ADR-0018.
                'scheduled_at' => BaseResource::instantOnWire($visit->scheduled_at),
                'previous_scheduled_at' => $nouveauCreneau ? $avant?->format(DATE_ATOM) : null,
            ])
            ->event('visit.confirmed_by_owner')
            ->log('visit.confirmed_by_owner');

        try {
            $this->notifier->confirmedByOwner($visit, $bailleur);
        } catch (Throwable $e) {
            Log::warning('visit.confirmed_by_owner.notify_failed', ['visit_id' => $visit->id] + SafeExceptionContext::of($e));
        }
    }
}
