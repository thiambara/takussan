<?php

namespace Database\Seeders\Billing;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditLot;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Boost\BoostLifecycle;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Carbon\CarbonImmutable;
use Closure;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Database\Seeders\System\BoostProductSeeder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2379 — six mois de crédits et de mise en avant, joués par les services de l'application dans
 * l'ordre du temps, toutes agences mêlées :
 *
 *  - le crédit de bienvenue, né de la vérification du numéro du titulaire (`PhoneVerified` →
 *    `WelcomeCreditService`), comme dans l'application ;
 *  - un geste commercial de la plateforme (`CreditLedger::adminAdjust`) ;
 *  - des achats de Vedette, de Remontée et de Badge (`BoostPurchaseService::purchase`), qui débitent
 *    le grand livre et prolongent une Vedette en cours par une tranche ; une agence à court de
 *    crédits n'achète pas — l'achat de crédits est la phase 2 (ADR-0061 §11) ;
 *  - les crédits mensuels du programme de lancement (`CreditLedger::adminAdjust`) ;
 *  - la campagne en cours : des Vedettes achetées ces dernières semaines, actives aujourd'hui ;
 *  - quelques Vedettes offertes par la plateforme (`offerFeatured`), ces derniers jours.
 *
 * Les deux balayages de `boosts:tick` — fin des boosts échus (`BoostLifecycle::endExpired`) et
 * expiration des lots (`CreditLedger::expireDue`) — passent au créneau de cinq minutes qui suit
 * chaque échéance, avant le geste suivant : une Vedette close au geste suivant l'était des jours
 * après sa fin, et comptait ces jours-là. Les
 * statistiques quotidiennes, que `boosts:tick` verse depuis les compteurs du cache, s'écrivent
 * ensuite pour chaque jour écoulé de chaque Vedette.
 *
 * Seuls les biens publics À LA FIN du seed reçoivent un boost : leur statut semé est leur statut
 * final, et l'achat refuse un bien loué ou vendu (`assertPublic`).
 */
class BoostActivitySeeder extends Seeder
{
    /** Ancienneté des crédits et de la mise en avant, en mois. */
    public const MOIS_D_ACTIVITE = 6;

    /** Période de `boosts:tick` (`routes/console.php` : `everyFiveMinutes`), en secondes. */
    private const PERIODE_DU_BALAYAGE = 300;

    /** Achats par agence sur la période, à la taille de l'agence (`SeedingContext::volume`). */
    private const ACHATS_PAR_AGENCE = 24;

    /** Crédits du programme de lancement, chaque mois, à la taille de l'agence ; valables 45 jours. */
    private const CREDITS_DU_MOIS = 60;

    /** Vedettes de la campagne en cours, à la taille de l'agence : celles qu'un visiteur voit aujourd'hui. */
    private const VEDETTES_EN_COURS = 8;

    /** @var array<string, int> offre (`kind:variant:durée`) => poids */
    private const OFFRES = [
        'featured::7' => 26,
        'featured::15' => 18,
        'featured::30' => 12,
        'bump::0' => 26,
        'badge:urgent:7' => 10,
        'badge:price_drop:7' => 8,
    ];

    /** @var list<array{date: CarbonImmutable, rang: int, geste: Closure(): void}> */
    private array $gestes = [];

    /** @var array<string, BoostProduct> */
    private array $offres = [];

    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly BoostPurchaseService $achats,
        private readonly BoostLifecycle $cycle,
        private readonly CreditLedger $grandLivre,
        private readonly PhoneVerificationService $telephones,
    ) {}

    public function run(): void
    {
        // Le catalogue est posé par la migration 2026_10_12_500400 et par DatabaseSeeder ; idempotent.
        app(BoostProductSeeder::class)->run();
        foreach (BoostProduct::query()->where('is_active', true)->get() as $offre) {
            $this->offres[$offre->kind->value.':'.$offre->variant?->value.':'.$offre->duration_days] = $offre;
        }

        $maintenant = CarbonImmutable::now();
        $lancement = $maintenant->subMonths(self::MOIS_D_ACTIVITE)->startOfDay();
        $plusGrande = collect($this->ctx->tailles)->sortDesc()->keys()->first();

        foreach ($this->ctx->agencies->sortBy('id') as $agency) {
            $debut = collect([$lancement, CarbonImmutable::parse($agency->created_at)->addDay()])->max();
            if ($debut->greaterThanOrEqualTo($maintenant)) {
                continue;
            }

            $this->bienvenue($agency, Timeline::businessHour($debut->addDays(mt_rand(0, 20))));
            if ($agency->id === $plusGrande) {
                $this->planifier(Timeline::businessHour($lancement->addMonths(2)), fn () => $this->grandLivre->adminAdjust(
                    $agency, 300, $this->ctx->operateur(), 'Geste commercial : lancement de la mise en avant', 90,
                ));
            }

            // Le programme de lancement : des crédits chaque mois, sans quoi l'offre de bienvenue,
            // valable 180 jours, s'épuisait des mois avant aujourd'hui — mesuré, 2 Vedettes actives sur
            // 582 biens en préproduction (2026-10-26).
            for ($mois = $debut->addMonth(); $mois->lessThan($maintenant); $mois = $mois->addMonth()) {
                $this->planifier(Timeline::businessHour($mois), fn () => $this->grandLivre->adminAdjust(
                    $agency, $this->ctx->volume(self::CREDITS_DU_MOIS, $agency->id), $this->ctx->operateur(),
                    'Programme de lancement : crédits du mois', 45,
                ));
            }

            $publics = Property::query()->public()->where('agency_id', $agency->id)->orderBy('id')->get();
            for ($i = 0; $i < $this->ctx->volume(self::ACHATS_PAR_AGENCE, $agency->id); $i++) {
                $date = Timeline::businessHour(Timeline::dateCroissante($debut->addDays(2), $maintenant->subHours(3)));
                $this->achat($agency, $publics, $date);
            }
            $this->campagneEnCours($agency, $publics, $maintenant);
        }

        $this->vedettesOffertes($maintenant);

        usort($this->gestes, fn (array $a, array $b) => [$a['date']->getTimestamp(), $a['rang']] <=> [$b['date']->getTimestamp(), $b['rang']]);
        foreach ($this->gestes as $geste) {
            if ($geste['date']->greaterThanOrEqualTo($maintenant)) {
                continue;
            }
            $this->balayagesJusquA($geste['date']);
            Timeline::aLaDate($geste['date'], $geste['geste']);
        }
        $this->balayagesJusquA($maintenant);

        $this->statistiquesQuotidiennes($maintenant);
    }

    /**
     * Les passages de `boosts:tick` (toutes les cinq minutes) qui ont quelque chose à faire avant
     * `$date` : un par échéance — fin d'un boost, expiration d'un lot —, au créneau qui la suit.
     * Les autres passages ne changent rien ; les rejouer tous coûtait 4 380 passages sur six mois,
     * à l'heure près seulement.
     */
    private function balayagesJusquA(CarbonImmutable $date): void
    {
        $dernier = null;
        while (($echeance = $this->prochaineEcheance()) !== null) {
            $passage = CarbonImmutable::createFromTimestamp(
                (intdiv($echeance->getTimestamp(), self::PERIODE_DU_BALAYAGE) + 1) * self::PERIODE_DU_BALAYAGE,
                $echeance->getTimezone(),
            );
            if ($passage->greaterThanOrEqualTo($date)) {
                return;
            }
            // Un passage qui ne solde pas son échéance la retrouverait au tour suivant, indéfiniment.
            if ($dernier !== null && $passage->lessThanOrEqualTo($dernier)) {
                throw new \LogicException("Échéance du {$echeance} restée due après le passage du {$passage}.");
            }
            Timeline::aLaDate($passage, function (): void {
                $this->cycle->endExpired();
                $this->grandLivre->expireDue();
            });
            $dernier = $passage;
        }
    }

    /** La plus proche des échéances que les deux balayages soldent — leurs propres prédicats. */
    private function prochaineEcheance(): ?CarbonImmutable
    {
        $dates = array_filter([
            PropertyBoost::query()->where('status', BoostStatus::Active)->whereNotNull('ends_at')
                ->whereIn('kind', [BoostKind::Featured, BoostKind::Badge])->min('ends_at'),
            CreditLot::query()->where('remaining_amount', '>', 0)->whereNotNull('expires_at')->min('expires_at'),
        ]);

        return $dates === [] ? null : CarbonImmutable::parse(min($dates));
    }

    /** @param  Closure(): mixed  $geste */
    private function planifier(CarbonImmutable $date, Closure $geste): void
    {
        $this->gestes[] = ['date' => $date, 'rang' => count($this->gestes), 'geste' => fn () => $geste()];
    }

    /** Le titulaire vérifie son numéro : c'est ce qui crédite l'espace (`GrantWelcomeCreditsOnPhoneVerified`). */
    private function bienvenue(Agency $agency, CarbonImmutable $date): void
    {
        $titulaire = $agency->primary_admin_id !== null ? User::query()->find($agency->primary_admin_id) : null;
        if ($titulaire === null || ! is_string($titulaire->phone) || $titulaire->phone === '') {
            return;
        }

        $this->planifier($date, function () use ($titulaire): void {
            // Le même numéro vérifié sur un autre compte refuserait la vérification (409).
            $pris = User::query()->where('phone', $titulaire->phone)->whereNotNull('phone_verified_at')->whereKeyNot($titulaire->id)->exists();
            if (! $pris) {
                $this->telephones->markVerified($titulaire->refresh(), (string) $titulaire->phone);
            }
        });
    }

    /** @param  Collection<int, Property>  $publics */
    private function achat(Agency $agency, $publics, CarbonImmutable $date): void
    {
        $candidats = $publics->filter(fn (Property $p) => CarbonImmutable::parse($p->published_at ?? $p->created_at)->lessThan($date->subDays(1)));
        $offre = $this->offres[StatusDistribution::pick(self::OFFRES)] ?? null;
        if ($candidats->isEmpty() || $offre === null) {
            return;
        }
        $bien = Tirage::un($candidats->values());
        $acheteurId = $this->ctx->agentAu($agency->id, $date);

        $this->planifier($date, function () use ($agency, $bien, $offre, $acheteurId): void {
            $acheteur = $acheteurId !== null ? User::query()->find($acheteurId) : null;
            if ($acheteur === null || $this->grandLivre->balance($agency) < $offre->price_credits) {
                return;
            }
            if ($offre->kind === BoostKind::Bump && $this->achats->bumpAvailableAt($bien) !== null) {
                return;
            }
            $this->achats->purchase($bien, $offre, $acheteur);
        });
    }

    /**
     * Les Vedettes qu'un visiteur voit aujourd'hui : chaque agence en a acheté ces dernières semaines,
     * sur des biens distincts, pour une durée qui court encore.
     *
     * @param  Collection<int, Property>  $publics
     */
    private function campagneEnCours(Agency $agency, Collection $publics, CarbonImmutable $maintenant): void
    {
        $candidats = $publics->filter(fn (Property $p) => CarbonImmutable::parse($p->published_at ?? $p->created_at)->lessThan($maintenant->subDays(30)))->values();
        $nombre = min($candidats->count(), $this->ctx->volume(self::VEDETTES_EN_COURS, $agency->id));

        foreach (Tirage::plusieurs($candidats, $nombre) as $bien) {
            $longue = mt_rand(1, 100) <= 60;
            $offre = $this->offres[$longue ? 'featured::30' : 'featured::15'] ?? null;
            $date = Timeline::businessHour($maintenant->subDays($longue ? mt_rand(2, 25) : mt_rand(1, 12)));
            $acheteurId = $this->ctx->agentAu($agency->id, $date);
            if ($offre === null || $acheteurId === null) {
                continue;
            }

            $this->planifier($date, function () use ($agency, $bien, $offre, $acheteurId): void {
                if ($this->grandLivre->balance($agency) >= $offre->price_credits) {
                    $this->achats->purchase($bien, $offre, User::query()->findOrFail($acheteurId));
                }
            });
        }
    }

    /** Deux Vedettes offertes par la plateforme, ces derniers jours, à la plus grande agence. */
    private function vedettesOffertes(CarbonImmutable $maintenant): void
    {
        $offre = $this->offres['featured::15'] ?? null;
        $agencyId = collect($this->ctx->tailles)->sortDesc()->keys()->first();
        if ($offre === null || $agencyId === null) {
            return;
        }
        $biens = Property::query()->public()->where('agency_id', $agencyId)->orderBy('id')->get();

        foreach (Tirage::plusieurs($biens, min(2, $biens->count())) as $bien) {
            $this->planifier(Timeline::businessHour($maintenant->subDays(mt_rand(1, 12))), fn () => $this->achats->offerFeatured(
                $bien, $offre, $this->ctx->operateur(), 'Vedette offerte : agence partenaire du lancement',
            ));
        }
    }

    /**
     * Une ligne par jour écoulé de chaque Vedette — la forme que `BoostStatsRecorder::flush()` verse.
     * Aujourd'hui n'a pas fini ses heures : il commence demain dans les statistiques.
     */
    private function statistiquesQuotidiennes(CarbonImmutable $maintenant): void
    {
        $hier = $maintenant->subDay()->startOfDay();

        PropertyBoost::query()->where('kind', BoostKind::Featured)->orderBy('id')->each(function (PropertyBoost $vedette) use ($hier): void {
            $jour = CarbonImmutable::parse($vedette->starts_at)->startOfDay();
            $dernier = $vedette->ended_at !== null ? CarbonImmutable::parse($vedette->ended_at)->startOfDay() : $hier;
            $dernier = $dernier->greaterThan($hier) ? $hier : $dernier;
            $audience = mt_rand(60, 240);

            $lignes = [];
            for (; $jour->lessThanOrEqualTo($dernier); $jour = $jour->addDay()) {
                $impressions = (int) round($audience * mt_rand(70, 130) / 100);
                $lignes[] = [
                    'property_boost_id' => $vedette->id,
                    'date' => $jour->toDateString(),
                    'impressions' => $impressions,
                    'clicks' => intdiv($impressions * mt_rand(8, 45), 1000),
                    'created_at' => $jour->addDay()->addMinutes(5),
                    'updated_at' => $jour->addDay()->addMinutes(5),
                ];
            }
            if ($lignes !== []) {
                DB::table('property_boost_daily_stats')->insert($lignes);
            }
        });
    }
}
