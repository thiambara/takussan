<?php

namespace App\Services\Dashboard;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * TCK-2791 — le mois que résument les tableaux de bord de l'agence, de l'agent et du bailleur :
 * `period` ∈ {`current_month`, `last_month`}, défaut `current_month`. Une liste FERMÉE : toute autre
 * valeur (un mot inconnu, un tableau `period[]=…`) rend 422 `dashboard.invalid_period`, jamais un mois
 * silencieusement autre.
 *
 * Le mois se juge au calendrier de Dakar, comme les autres lectures du mois (`DashboardOwnerService::TIMEZONE`),
 * puis ses bornes passent au fuseau de l'application : c'est dans celui-ci que la base compare.
 *
 * `enTete()` rend la clé `period` de la réponse : la période servie, et `as_of_today`, les chemins des
 * chiffres qui restent l'ÉTAT DU JOUR quel que soit le mois (biens loués, occupation du jour, impayés en
 * cours…), pour qu'aucun écran ne présente un état d'aujourd'hui comme celui du mois dernier.
 */
final readonly class PeriodeDuTableauDeBord
{
    public const CURRENT_MONTH = 'current_month';

    public const LAST_MONTH = 'last_month';

    public const VALEURS = [self::CURRENT_MONTH, self::LAST_MONTH];

    public const TIMEZONE = 'Africa/Dakar';

    private function __construct(
        public string $cle,
        public CarbonImmutable $debut,
        public CarbonImmutable $fin,
    ) {}

    /** Le mois en cours : le défaut de toute lecture qui ne demande rien (accueil, alertes, KPI). */
    public static function moisEnCours(): self
    {
        return self::pour(self::CURRENT_MONTH);
    }

    /**
     * Lit `period` dans la requête. Absent (ou vide) : le mois en cours. Hors de la liste : 422. À appeler
     * APRÈS les gardes du contrôleur : la période ne change aucun droit, et ne renseigne pas qui n'en a pas.
     */
    public static function depuisLaRequete(Request $request): self
    {
        $valeur = $request->query('period');
        if ($valeur === null || $valeur === '') {
            return self::moisEnCours();
        }
        abort_code_unless(is_string($valeur) && in_array($valeur, self::VALEURS, true), 422, 'dashboard.invalid_period');

        return self::pour($valeur);
    }

    public static function pour(string $cle): self
    {
        $maintenant = CarbonImmutable::now(self::TIMEZONE);
        // Le 1er du mois PUIS le mois d'avant : `subMonth()` sur un 31 resterait dans le même mois.
        $mois = $cle === self::LAST_MONTH ? $maintenant->startOfMonth()->subMonthNoOverflow() : $maintenant->startOfMonth();
        $fuseau = (string) config('app.timezone');

        return new self($cle, $mois->setTimezone($fuseau), $mois->endOfMonth()->setTimezone($fuseau));
    }

    public function estLeMoisEnCours(): bool
    {
        return $this->cle === self::CURRENT_MONTH;
    }

    /** `AAAA-MM` du mois servi, au calendrier de Dakar : la clé des séries de `PortfolioMetrics`. */
    public function mois(): string
    {
        return $this->debut->setTimezone(self::TIMEZONE)->format('Y-m');
    }

    /**
     * @param  list<string>  $etatsDuJour  les chemins (`finance.overdue_count`…) qui ne suivent pas la période
     * @return array{key: string, start: string, end: string, as_of_today: list<string>}
     */
    public function enTete(array $etatsDuJour): array
    {
        return [
            'key' => $this->cle,
            'start' => $this->debut->toIso8601String(),
            'end' => $this->fin->toIso8601String(),
            'as_of_today' => $etatsDuJour,
        ];
    }
}
