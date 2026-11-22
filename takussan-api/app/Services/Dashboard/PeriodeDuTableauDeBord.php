<?php

namespace App\Services\Dashboard;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * TCK-2791 — le mois que résument les tableaux de bord de l'agence, de l'agent et du bailleur :
 * `period` ∈ {`current_month`, `last_month`, `last_12_months` (TCK-2865)}, défaut `current_month`. Une liste FERMÉE : toute autre
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

    /**
     * TCK-2865 — les douze mois glissants TERMINÉS au mois en cours : de décembre 2025 à novembre 2026 un jour de
     * novembre 2026. Les chiffres « du mois » d'une lecture deviennent ceux de la période entière (la somme des
     * mois pour un montant, une seule mesure sur la période pour un taux) ; les clés ne changent pas de nom.
     */
    public const LAST_12_MONTHS = 'last_12_months';

    public const VALEURS = [self::CURRENT_MONTH, self::LAST_MONTH, self::LAST_12_MONTHS];

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
        // TCK-2865 — douze mois : le premier est onze mois avant le mois en cours, le dernier est le mois en cours.
        $premier = $cle === self::LAST_12_MONTHS ? $mois->subMonthsNoOverflow(11) : $mois;

        return new self($cle, $premier->setTimezone($fuseau), $mois->endOfMonth()->setTimezone($fuseau));
    }

    /** `AAAA-MM` du PREMIER mois servi, au calendrier de Dakar (le mois servi, hors `last_12_months`). */
    public function mois(): string
    {
        return $this->debut->setTimezone(self::TIMEZONE)->format('Y-m');
    }

    /**
     * TCK-2865 — la période couvre-t-elle aujourd'hui ? Vrai pour le mois en cours et pour les douze mois (qui
     * finissent au mois en cours), faux pour le mois dernier.
     */
    public function couvreAujourdhui(): bool
    {
        return $this->cle !== self::LAST_MONTH;
    }

    /**
     * `AAAA-MM` des mois servis, au calendrier de Dakar, dans l'ordre : les clés des séries de `PortfolioMetrics`.
     * Un seul pour un mois, douze pour `last_12_months` (TCK-2865).
     *
     * @return list<string>
     */
    public function moisCouverts(): array
    {
        $mois = [];
        $fin = $this->fin->setTimezone(self::TIMEZONE)->startOfMonth();
        for ($m = $this->debut->setTimezone(self::TIMEZONE)->startOfMonth(); $m->lessThanOrEqualTo($fin); $m = $m->addMonthNoOverflow()) {
            $mois[] = $m->format('Y-m');
        }

        return $mois;
    }

    /**
     * TCK-2865 — la somme d'une série mensuelle (`AAAA-MM` => montant) sur les mois servis : le montant « du mois »
     * d'un mois, celui des douze mois sinon. Un mois absent de la série vaut 0.
     *
     * @param  array<string, float|int|null>  $serie
     */
    public function somme(array $serie): float
    {
        $total = 0.0;
        foreach ($this->moisCouverts() as $m) {
            $total += (float) ($serie[$m] ?? 0);
        }

        return round($total, 2);
    }

    /**
     * TCK-2865 — `months` : les mois couverts (`AAAA-MM`), un pour un mois, douze pour `last_12_months`.
     *
     * @param  list<string>  $etatsDuJour  les chemins (`finance.overdue_count`…) qui ne suivent pas la période
     * @return array{key: string, start: string, end: string, months: list<string>, as_of_today: list<string>}
     */
    public function enTete(array $etatsDuJour): array
    {
        return [
            'key' => $this->cle,
            'start' => $this->debut->toIso8601String(),
            'end' => $this->fin->toIso8601String(),
            'months' => $this->moisCouverts(),
            'as_of_today' => $etatsDuJour,
        ];
    }
}
