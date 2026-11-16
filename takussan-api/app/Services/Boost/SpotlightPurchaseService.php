<?php

namespace App\Services\Boost;

use App\Http\Controllers\Public\PublicAgencyController;
use App\Models\Agency;
use App\Models\AgencySpotlight;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\CreditMovementType;
use App\Models\GeoCity;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — acheter la place « Mise en avant » de l'annuaire
 * d'une ville avec les crédits de l'espace, et la libérer (remboursée) quand elle se perd.
 *
 * L'achat se joue dans UNE transaction, dans cet ordre :
 *
 * 1. le verrou de la ligne de l'agence (ADR-0061 § 2 : deux achats d'un même espace se sérialisent) ;
 * 2. le verrou consultatif de la VILLE ({@see self::lockCity()}) — le verrou de l'agence ne sérialise
 *    pas deux agences qui visent la même ville ; l'offre du super-admin le prend aussi ;
 * 3. l'éligibilité, la période, le solde : tous les refus tombent AVANT toute écriture (AC3) ;
 * 4. la place, insérée dans un point de reprise : si la contrainte d'exclusion refuse malgré tout
 *    (un écrivain qui ne prend pas le verrou consultatif), seul le point de reprise est abandonné, et
 *    l'achat rend 422 sans avoir rien débité (AC1) ;
 * 5. le débit, EN DERNIER — aucun débit sans place, aucune place sans débit.
 */
final class SpotlightPurchaseService
{
    /** L'espace des verrous consultatifs de la place par ville (premier entier de `pg_advisory_xact_lock`). */
    public const CITY_LOCK_CLASS = 2525;

    public const IDEMPOTENCY_TTL_HOURS = 24;

    /** Garde-fou de la recherche du premier créneau libre (`next_free`) : une ville ne porte pas plus de places d'affilée. */
    private const MAX_HOPS = 200;

    public function __construct(
        private readonly CreditLedger $ledger,
        private readonly SpotlightSettings $settings,
    ) {}

    /**
     * Sérialise toute écriture de place sur cette ville (`null` : l'annuaire sans ville) jusqu'à la
     * fin de la transaction courante.
     */
    public static function lockCity(?int $geoCityId): void
    {
        DB::select('SELECT pg_advisory_xact_lock(?, ?)', [self::CITY_LOCK_CLASS, $geoCityId ?? 0]);
    }

    /**
     * Ce qu'un achat donnerait maintenant, sans rien verrouiller ni écrire : l'écran l'annonce AVANT la
     * confirmation (période réelle sous `next_free`, prochaine disponibilité sous `refuse`).
     *
     * @return array{available: bool, reason: ?string, starts_at: ?CarbonInterface, ends_at: ?CarbonInterface, next_free_at: ?CarbonInterface}
     */
    public function quote(?int $geoCityId, ?CarbonInterface $requestedStart): array
    {
        $debut = $this->requestedStart($requestedStart);
        $horizon = $this->horizon();
        if ($debut->greaterThan($horizon)) {
            return ['available' => false, 'reason' => 'too_far', 'starts_at' => null, 'ends_at' => null, 'next_free_at' => null];
        }

        $libre = $this->firstFreeStart($geoCityId, $debut, $horizon);
        $duree = $this->settings->durationDays();
        $prise = $libre === null || ! $libre->equalTo($debut);

        if ($prise && $this->settings->whenTaken() === 'refuse') {
            return ['available' => false, 'reason' => 'taken', 'starts_at' => null, 'ends_at' => null, 'next_free_at' => $libre];
        }
        if ($libre === null) {
            return ['available' => false, 'reason' => 'no_free_period', 'starts_at' => null, 'ends_at' => null, 'next_free_at' => null];
        }

        return ['available' => true, 'reason' => null, 'starts_at' => $libre, 'ends_at' => $libre->copy()->addDays($duree), 'next_free_at' => $libre];
    }

    public function purchase(Agency $agency, ?int $geoCityId, ?CarbonInterface $requestedStart, User $buyer, ?string $idempotencyKey = null): SpotlightPurchaseResult
    {
        abort_code_unless($this->settings->saleEnabled(), 422, 'credits.spotlight_sale_closed');
        abort_code_if($geoCityId === null && ! $this->settings->sellDirectoryWide(), 422, 'credits.spotlight_directory_wide_closed');
        $ville = $geoCityId === null ? null : GeoCity::query()->findOrFail($geoCityId);

        try {
            return DB::transaction(function () use ($agency, $ville, $geoCityId, $requestedStart, $buyer, $idempotencyKey): SpotlightPurchaseResult {
                $locked = Agency::query()->whereKey($agency->getKey())->lockForUpdate()->firstOrFail();

                $cacheKey = $idempotencyKey === null ? null : 'spotlight-purchase:'.$locked->getKey().':'.hash('sha256', $idempotencyKey);
                if ($cacheKey !== null && ($rejoue = $this->replay($cacheKey, $geoCityId)) !== null) {
                    return new SpotlightPurchaseResult($rejoue, true);
                }

                self::lockCity($geoCityId);

                $this->assertListed($locked, $ville);

                $periode = $this->quote($geoCityId, $requestedStart);
                if (! $periode['available']) {
                    match ($periode['reason']) {
                        'too_far' => abort_code(422, 'credits.spotlight_too_far', ['days' => $this->settings->maxAdvanceDays()]),
                        'no_free_period' => abort_code(422, 'credits.spotlight_no_free_period', ['days' => $this->settings->maxAdvanceDays()]),
                        default => abort_code(422, 'credits.spotlight_taken', ['next_free_at' => $periode['next_free_at']?->toIso8601String()]),
                    };
                }
                /** @var CarbonInterface $debut */
                $debut = $periode['starts_at'];
                /** @var CarbonInterface $fin */
                $fin = $periode['ends_at'];

                $prix = $this->settings->priceCredits();
                $solde = $this->ledger->balance($locked);
                if ($solde < $prix) {
                    throw new InsufficientCredits($prix, $solde);
                }

                if ($this->settings->offeredOverlap() === 'yields') {
                    $this->yieldOffered($geoCityId, $debut, $fin, $buyer);
                }

                $place = $this->insert([
                    'agency_id' => $locked->getKey(),
                    'geo_city_id' => $geoCityId,
                    'starts_at' => $debut,
                    'ends_at' => $fin,
                    'origin' => AgencySpotlight::ORIGIN_PURCHASED,
                    'price_credits' => $prix,
                    'purchased_by_id' => $buyer->getKey(),
                ]);

                $this->ledger->spend($locked, $prix, CreditMovementType::Spend, null, $buyer, null, $place);

                activity('AgencySpotlight')
                    ->performedOn($place)
                    ->causedBy($buyer)
                    ->withProperties([
                        'agency_id' => $place->agency_id,
                        'geo_city_id' => $place->geo_city_id,
                        'starts_at' => $place->starts_at->toIso8601String(),
                        'ends_at' => $place->ends_at->toIso8601String(),
                        'price_credits' => $prix,
                    ])
                    ->event('agency_spotlight_purchased')
                    ->log('Mise en avant d\'agence achetée');

                if ($cacheKey !== null) {
                    Cache::put($cacheKey, ['spotlight_id' => $place->getKey(), 'geo_city_id' => $geoCityId], now()->addHours(self::IDEMPOTENCY_TTL_HOURS));
                }

                return new SpotlightPurchaseResult($place, false);
            });
        } catch (InsufficientCredits $e) {
            abort_code(422, 'credits.insufficient', ['missing' => $e->missing(), 'balance' => $e->balance]);
        }
    }

    /**
     * L'agence quitte le site (suspendue, inactive) : ses places ACHETÉES, en cours ou à venir, sont
     * libérées et remboursées selon `spotlight.refund_on_suspension` — `none` les garde (ADR-0092 § 4).
     * Idempotent : la libération est réclamée par `UPDATE … WHERE cancelled_at IS NULL`, et seule la
     * requête qui la réclame rembourse. Rend le nombre de places libérées.
     */
    public function releaseForAgency(Agency $agency): int
    {
        $regle = $this->settings->refundOnSuspension();
        if ($regle === 'none') {
            return 0;
        }

        $ids = AgencySpotlight::query()
            ->where('agency_id', $agency->getKey())
            ->where('origin', AgencySpotlight::ORIGIN_PURCHASED)
            ->whereNull('cancelled_at')
            ->where('ends_at', '>', now())
            ->orderBy('id')
            ->pluck('id');

        $liberees = 0;
        foreach ($ids as $id) {
            if ($this->release((int) $id, $regle, null, 'agency_left_site', 'agency_spotlight_refunded_on_suspension')) {
                $liberees++;
            }
        }

        return $liberees;
    }

    /** Le rattrapage de `boosts:tick` : une écriture de masse du statut ne déclenche aucun observateur. */
    public function releaseForInactiveAgencies(): int
    {
        if ($this->settings->refundOnSuspension() === 'none') {
            return 0;
        }

        $total = 0;
        Agency::query()
            ->where('status', '!=', AgencyStatus::Active->value)
            ->whereIn('id', AgencySpotlight::query()
                ->where('origin', AgencySpotlight::ORIGIN_PURCHASED)
                ->whereNull('cancelled_at')
                ->where('ends_at', '>', now())
                ->select('agency_id'))
            ->orderBy('id')
            ->each(function (Agency $agency) use (&$total): void {
                $total += $this->releaseForAgency($agency);
            });

        return $total;
    }

    /**
     * Le super-admin retire une place ACHETÉE : libérée et remboursée au prorata, quel que soit le
     * réglage — un retrait de la plateforme ne confisque pas des crédits payés.
     */
    public function revoke(AgencySpotlight $place, User $operator): void
    {
        $this->release((int) $place->getKey(), 'prorata', $operator, 'revoked_by_platform', 'super_admin_agency_spotlight_revoked');
    }

    /**
     * La part non servie, au prix figé : les jours PLEINS restants (ADR-0061 § 8), arrondi à l'entier
     * inférieur ; une place pas encore commencée est rendue en entier.
     */
    public static function prorata(AgencySpotlight $place, CarbonInterface $instant): int
    {
        $prix = (int) $place->price_credits;
        if ($prix <= 0) {
            return 0;
        }
        if ($instant->lessThanOrEqualTo($place->starts_at)) {
            return $prix;
        }
        $total = $place->starts_at->diffInSeconds($place->ends_at, true);
        $reste = $instant->diffInSeconds($place->ends_at, false);
        if ($total <= 0 || $reste <= 0) {
            return 0;
        }
        $joursPleins = intdiv((int) $reste, 86400);

        return intdiv($prix * $joursPleins * 86400, (int) $total);
    }

    private function release(int $id, string $regle, ?User $actor, string $motif, string $evenement): bool
    {
        return DB::transaction(function () use ($id, $regle, $actor, $motif, $evenement): bool {
            $maintenant = now();
            $reclamee = AgencySpotlight::query()
                ->whereKey($id)
                ->whereNull('cancelled_at')
                ->update(['cancelled_at' => $maintenant, 'updated_at' => $maintenant]);
            if ($reclamee !== 1) {
                return false;
            }

            $place = AgencySpotlight::query()->findOrFail($id);
            $montant = $regle === 'full' ? (int) $place->price_credits : self::prorata($place, $maintenant);
            $plan = $this->ledger->refundSpotlight($place, $montant, $actor, $motif);
            $place->forceFill(['refunded_credits' => $plan->refunded])->save();

            activity('AgencySpotlight')
                ->performedOn($place)
                ->causedBy($actor)
                ->withProperties([
                    'agency_id' => $place->agency_id,
                    'geo_city_id' => $place->geo_city_id,
                    'rule' => $regle,
                    'refunded_credits' => $plan->refunded,
                    'expired_credits' => $plan->expired,
                ])
                ->event($evenement)
                ->log('Mise en avant d\'agence libérée');

            return true;
        });
    }

    /**
     * `spotlight.offered_overlap = yields` : une place OFFERTE qui chevauche la période achetée cède —
     * libérée si elle commence dans la période ou après son début, écourtée au début de la période si
     * elle a commencé avant. Sous le verrou consultatif de la ville.
     */
    private function yieldOffered(?int $geoCityId, CarbonInterface $debut, CarbonInterface $fin, User $buyer): void
    {
        $offertes = AgencySpotlight::query()
            ->overlapping($geoCityId, Carbon::instance($debut), Carbon::instance($fin))
            ->where('origin', AgencySpotlight::ORIGIN_OFFERED)
            ->orderBy('id')
            ->get();

        foreach ($offertes as $offerte) {
            $avant = ['starts_at' => $offerte->starts_at->toIso8601String(), 'ends_at' => $offerte->ends_at->toIso8601String()];
            if ($offerte->starts_at->greaterThanOrEqualTo($debut)) {
                $offerte->forceFill(['cancelled_at' => now()])->save();
            } else {
                $offerte->forceFill(['ends_at' => $debut])->save();
            }
            activity('AgencySpotlight')
                ->performedOn($offerte)
                ->causedBy($buyer)
                ->withProperties($avant + ['agency_id' => $offerte->agency_id, 'geo_city_id' => $offerte->geo_city_id, 'cancelled' => $offerte->cancelled_at !== null])
                ->event('agency_spotlight_offer_yielded')
                ->log('Mise en avant offerte cédée à un achat');
        }
    }

    /** @param  array<string, mixed>  $attributs */
    private function insert(array $attributs): AgencySpotlight
    {
        try {
            // Un point de reprise : une violation de la contrainte n'abandonne que lui (piège n° 1).
            return DB::transaction(fn () => AgencySpotlight::query()->create($attributs));
        } catch (QueryException $e) {
            // 23P01 : `exclusion_violation` — la base reste l'arbitre de la place (ADR-0092 § 2).
            if ($e->getCode() === '23P01') {
                abort_code(422, 'credits.spotlight_taken');
            }
            throw $e;
        }
    }

    /** Une agence que l'annuaire de cette ville ne montrerait pas n'achète pas sa place. */
    private function assertListed(Agency $agency, ?GeoCity $ville): void
    {
        $eligible = PublicAgencyController::agencesDeLAnnuaire()->whereKey($agency->getKey());
        PublicAgencyController::filtrerParVille($eligible, $ville?->name);
        abort_code_unless($eligible->exists(), 422, 'credits.spotlight_agency_not_listed');
    }

    private function replay(string $cacheKey, ?int $geoCityId): ?AgencySpotlight
    {
        $vu = Cache::get($cacheKey);
        if (! is_array($vu)) {
            return null;
        }
        $place = AgencySpotlight::query()->find($vu['spotlight_id'] ?? null);
        if ($place === null) {
            return null;
        }
        abort_code_unless(($vu['geo_city_id'] ?? null) === $geoCityId, 422, 'credits.spotlight_key_reused');

        return $place;
    }

    private function requestedStart(?CarbonInterface $requested): Carbon
    {
        $maintenant = now();
        if ($requested === null || $requested->lessThanOrEqualTo($maintenant)) {
            return $maintenant->copy();
        }

        return Carbon::instance($requested);
    }

    private function horizon(): Carbon
    {
        return now()->addDays($this->settings->maxAdvanceDays());
    }

    /**
     * Le premier début ≥ `$debut` où la durée réglée tient sans chevaucher une place qui occupe la
     * ville (sous `yields`, une place offerte n'occupe pas), et au plus tard à l'horizon ; `null` sinon.
     */
    private function firstFreeStart(?int $geoCityId, Carbon $debut, Carbon $horizon): ?Carbon
    {
        $duree = $this->settings->durationDays();
        $cedent = $this->settings->offeredOverlap() === 'yields';
        $candidat = $debut->copy();

        for ($i = 0; $i < self::MAX_HOPS; $i++) {
            if ($candidat->greaterThan($horizon)) {
                return null;
            }
            $finMax = AgencySpotlight::query()
                ->overlapping($geoCityId, $candidat, $candidat->copy()->addDays($duree))
                ->when($cedent, fn ($q) => $q->where('origin', AgencySpotlight::ORIGIN_PURCHASED))
                ->max('ends_at');
            if ($finMax === null) {
                return $candidat;
            }
            $candidat = Carbon::parse($finMax);
        }

        return null;
    }
}
