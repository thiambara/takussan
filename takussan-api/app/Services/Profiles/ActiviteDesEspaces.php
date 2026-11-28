<?php

namespace App\Services\Profiles;

use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Policies\PropertyContactLeadPolicy;
use App\Services\Dashboard\PortfolioMetrics;
use App\Services\Dashboard\PortfolioScope;
use App\Services\Visit\VisitesLisibles;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * TCK-2847 (ADR-0116 § 5) — la ligne d'activité de chaque espace, pour choisir où aller avant d'y
 * aller (« 4 demandes · 2 visites aujourd'hui »).
 *
 * Chaque compteur est calculé **sous le profil** ({@see SousLeProfil}), par la règle même de la liste
 * qui le montre, jamais recopiée :
 *
 *  · agent, admin d'agence — `unhandled_leads` : la portée de l'index des demandes
 *    (`PropertyContactLeadPolicy::scopeIndex`) sous `filter[handled]=0`, comme le compteur du menu ;
 *    `visits_today` : `VisitesLisibles` sous `filter[day]=<aujourd'hui à Dakar>`, l'onglet
 *    « Aujourd'hui » de `GET /api/property-visits/counts` ;
 *  · bailleur — `properties` : son portefeuille dans l'agence du profil (hors vendus et archivés,
 *    comme `portfolio.total` de son accueil) ; `rent_overdue` : les échéances échues non soldées de
 *    ces baux (`PortfolioMetrics::overdue`, `finance.overdue_count` de son accueil), bornées à l'agence
 *    du profil ({@see PortfolioScope::dansLAgence()}) ;
 *  · prestataire — `interventions_today` : ses interventions (`MaintenanceRequest::visibleTo`,
 *    `filter[assigned_to]`) prévues aujourd'hui (`filter[scheduled_from|to]`) et pas encore finies
 *    (`MaintenanceRequest::FINISHED_STATUSES`).
 *
 * Le nombre de requêtes est borné PAR PROFIL et ne dépend jamais du nombre d'objets : chaque compteur
 * est un `count(*)`.
 */
final class ActiviteDesEspaces
{
    public function __construct(
        private readonly ActiveProfileResolver $resolver,
        private readonly PropertyContactLeadPolicy $demandes,
        private readonly PortfolioMetrics $metrics,
    ) {}

    /**
     * @param  iterable<Model>  $profils  les profils ACTIFS de l'appelant
     * @return array<string, array<string, int>> identifiant composite → compteurs
     */
    public function pour(User $user, iterable $profils): array
    {
        $aujourdhui = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->toDateString();
        $activite = [];
        foreach ($profils as $profil) {
            $activite[$this->resolver->compositeId($profil)] = SousLeProfil::juger(
                $profil,
                fn (): array => $this->compteurs($user, $profil, $aujourdhui),
            );
        }

        return $activite;
    }

    /** @return array<string, int> */
    private function compteurs(User $user, Model $profil, string $aujourdhui): array
    {
        return match (true) {
            $profil instanceof AgentProfile, $profil instanceof AgencyAdminProfile => [
                'unhandled_leads' => $this->demandesNonTraitees($user),
                'visits_today' => $this->visitesDuJour($user, $aujourdhui),
            ],
            $profil instanceof OwnerProfile => $this->bailleur($user, (int) $profil->agency_id),
            $profil instanceof ServiceProviderProfile => [
                'interventions_today' => $this->interventionsDuJour($user, $aujourdhui),
            ],
            default => [],
        };
    }

    private function demandesNonTraitees(User $user): int
    {
        $base = PropertyContactLead::query();
        $this->demandes->scopeIndex($base, $user);

        return PropertyContactLead::buildQuery($base, self::filtres(['handled' => '0']))
            ->getEloquentBuilder()
            ->count();
    }

    private function visitesDuJour(User $user, string $aujourdhui): int
    {
        return PropertyVisit::buildQuery(VisitesLisibles::restreindre(PropertyVisit::query(), $user), self::filtres(['day' => $aujourdhui]))
            ->getEloquentBuilder()
            ->count();
    }

    /** @return array{properties: int, rent_overdue: int} */
    private function bailleur(User $user, int $agencyId): array
    {
        $scope = PortfolioScope::landlord((int) $user->id)->dansLAgence($agencyId);

        return [
            'properties' => $scope->properties(Property::query())
                ->whereNotIn('status', array_map(fn ($s) => $s->value, Property::OUT_OF_PORTFOLIO_STATUSES))
                ->count(),
            'rent_overdue' => $this->metrics->overdue($scope)['count'],
        ];
    }

    private function interventionsDuJour(User $user, string $aujourdhui): int
    {
        $filtres = ['assigned_to' => (string) $user->id, 'scheduled_from' => $aujourdhui, 'scheduled_to' => $aujourdhui];

        return MaintenanceRequest::buildQuery(MaintenanceRequest::query()->visibleTo($user), self::filtres($filtres))
            ->getEloquentBuilder()
            ->whereNotIn('status', array_map(fn ($s) => $s->value, MaintenanceRequest::FINISHED_STATUSES))
            ->count();
    }

    /**
     * Une requête qui ne porte QUE ces filtres : ni tri, ni champs, ni inclusions — un compte ne les lit
     * pas. Le motif de `PropertyVisitController::counts`.
     *
     * @param  array<string, string>  $filtres
     */
    private static function filtres(array $filtres): Request
    {
        return Request::create('/', 'GET', ['filter' => $filtres]);
    }
}
