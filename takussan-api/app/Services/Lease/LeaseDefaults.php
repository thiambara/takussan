<?php

namespace App\Services\Lease;

use App\Domain\Settings\EditablePlatformSettings;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Model\LeaseService;
use App\Services\Property\CoutDEntree;
use App\Support\ScopedSetting;

/**
 * TCK-2643 — ce qu'un bail NEUF reprend du bien, de l'agence et de la plateforme
 * (`GET /api/leases/defaults`), avec la SOURCE de chaque valeur : `property` (l'annonce), `agency`
 * (une ligne de réglage de l'agence du bien), `platform` (le catalogue, qui porte le défaut).
 *
 * Préremplir n'est pas imposer : rien n'est écrit ici, le formulaire envoie ce que l'agent a gardé.
 * Décisions de la session du 2026-11-12 (scratchpad `impl/lot2/decisions-2643.md`) :
 *
 * - la pénalité de retard (`lease.late_fee_percent`, `lease.late_fee_grace_days`) vaut 0 par défaut,
 *   « pas de pénalité » : aucune valeur commerciale inventée. Ces deux clés n'ont pas d'autre lecteur :
 *   `LateFeeCalculator` lit la colonne du bail ;
 * - le taux de commission de l'agence (`agencies.commission_rate`) n'est rendu qu'en INFORMATION,
 *   au personnel seul : le recopier sur le bail figerait le taux des reversements
 *   (`PayoutCalculator` lit le bail d'abord), et un bailleur qui l'enverrait prendrait 403 ;
 * - l'indemnité de départ anticipé est bornée au domaine du bail (0-12) : le catalogue admet 24, et
 *   une valeur d'agence au-delà ferait refuser le POST ;
 * - le jour de paiement vaut 1, source `platform` (le défaut du formulaire) : aucune clé ne le porte ;
 * - le loyer ne se préremplit que d'une location MENSUELLE (`CoutDEntree::sApplique`) ; sinon le
 *   prix et sa période sont rendus pour que l'écran les dise.
 */
final class LeaseDefaults
{
    public const SOURCE_PROPERTY = 'property';

    public const SOURCE_AGENCY = 'agency';

    public const SOURCE_PLATFORM = 'platform';

    /** Défauts du catalogue (`EditablePlatformSettings`) : pas de pénalité. */
    public const DEFAULT_LATE_FEE_PERCENT = 0;

    public const DEFAULT_LATE_FEE_GRACE_DAYS = 0;

    /** Le défaut du formulaire de création, que rien d'autre ne règle. */
    public const PAYMENT_DAY = 1;

    /** La borne du bail (`StoreLeaseRequest`, `UpdateLeaseRequest`), plus étroite que le catalogue. */
    public const EARLY_TERMINATION_MAX_MONTHS = 12;

    /** Les biens dont le bail est commercial ; tout autre bien loué prend un bail d'habitation. */
    public const COMMERCIAL_TYPES = [PropertyType::Office, PropertyType::Shop, PropertyType::Warehouse, PropertyType::Factory];

    public function __construct(
        private readonly PlatformSettingService $platform,
        private readonly RentReviewService $rentReview,
        private readonly EarlyTerminationService $earlyTermination,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function for(Property $property, User $user): array
    {
        $agencyId = $property->agency_id !== null ? (int) $property->agency_id : null;
        $currency = $property->currency instanceof Currency ? $property->currency->value : ($property->currency ?? 'XOF');
        $mensuel = CoutDEntree::sApplique($property->contract_type, $property->rent_period);
        $vente = $this->contractType($property) === ContractType::Sale;
        $loyer = $mensuel && $property->price !== null ? (float) $property->price : null;
        $caution = $property->deposit_months;

        $defaults = [
            'property_id' => $property->id,
            'type' => $this->leaseType($property)->value,
            'currency' => $currency,
            // Le prix tel que l'annonce le porte : l'écran le dit quand le loyer ne se préremplit pas.
            'property_price' => $property->price === null ? null : [
                'amount' => $this->amount((float) $property->price, $currency),
                'period' => $property->rent_period?->value,
                'contract_type' => $this->contractType($property)?->value,
            ],
            'monthly_rent' => $loyer === null ? null : $this->fromProperty($this->amount($loyer, $currency)),
            'sale_price' => $vente && $property->price !== null
                ? $this->fromProperty($this->amount((float) $property->price, $currency))
                : null,
            'monthly_charges' => $mensuel && $property->monthly_charges !== null
                ? $this->fromProperty($this->amount((float) $property->monthly_charges, $currency))
                : null,
            'deposit_months' => $mensuel && $caution !== null ? $this->fromProperty((int) $caution) : null,
            'deposit_amount' => $loyer !== null && $caution !== null
                ? $this->fromProperty($this->amount($loyer * (int) $caution, $currency))
                : null,
            'advance_months' => $mensuel && $property->advance_months !== null ? $this->fromProperty((int) $property->advance_months) : null,
            'agency_fee_months' => $mensuel && $property->agency_fee_months !== null
                ? $this->fromProperty($this->number((float) $property->agency_fee_months))
                : null,
            'entry_cost' => $this->entryCost($property),
            'payment_day' => ['value' => self::PAYMENT_DAY, 'source' => self::SOURCE_PLATFORM],
            'late_fee_percent' => $this->scoped('lease.late_fee_percent', $agencyId, $this->lateFeePercent($agencyId)),
            'late_fee_grace_days' => $this->scoped('lease.late_fee_grace_days', $agencyId, $this->lateFeeGraceDays($agencyId)),
            'early_termination_penalty_months' => $this->scoped(
                EarlyTerminationService::SETTING_KEY,
                $agencyId,
                min(self::EARLY_TERMINATION_MAX_MONTHS, $this->earlyTermination->resolvePenaltyMonths($agencyId)),
            ),
            'rent_review_max_pct' => $this->scoped(
                RentReviewService::SETTING_KEY,
                $agencyId,
                $this->number($this->rentReview->resolveMaxPct($agencyId)),
            ),
            // TCK-2734 — les candidatures ouvertes que l'ENVOI en signature du bail fermera (décision 7b :
            // plus la création du brouillon) : l'étape « Vérifier » le dit près de « Envoyer à la
            // signature ». Avec leur client : celles du LOCATAIRE du bail (la réservation d'origine
            // comprise) se complètent, les autres sont refusées — `LeaseService::cloreLesCandidaturesDuBien()`,
            // appelée par `LeaseSignatureService` (envoi en signature et signature papier). Le
            // locataire n'est connu qu'à l'étape 2, le front compte donc lui-même.
            'open_applications' => Booking::query()
                ->where('property_id', $property->id)
                ->where('kind', BookingKind::Application->value)
                ->whereIn('status', [BookingStatus::Pending->value, BookingStatus::Confirmed->value])
                ->orderBy('id')
                ->get(['id', 'customer_id'])
                ->map(fn (Booking $b) => ['id' => (int) $b->id, 'customer_id' => (int) $b->customer_id])
                ->all(),
        ];

        // Décision 3 — une information pour le personnel, jamais un terme prérempli du bail.
        if (LeaseService::maySetCommissionTerms($user, $agencyId)) {
            $taux = Agency::query()->whereKey($agencyId)->value('commission_rate');
            $defaults['agency_commission_rate'] = $taux === null ? null
                : ['value' => $this->number((float) $taux), 'source' => self::SOURCE_AGENCY];
        }

        return $defaults;
    }

    /** Le taux de pénalité qu'un bail neuf reprend : la ligne de l'agence, sinon le catalogue. */
    public function lateFeePercent(?int $agencyId): float|int
    {
        // r6 — une ligne d'agence sans valeur numérique n'est pas un réglage : le catalogue reprend la main.
        $value = $this->agencyValue('lease.late_fee_percent', $agencyId) ?? $this->platform->getValue('lease.late_fee_percent');

        return is_numeric($value)
            ? $this->number(EditablePlatformSettings::clamp('lease.late_fee_percent', (float) $value))
            : self::DEFAULT_LATE_FEE_PERCENT;
    }

    /** Les jours de grâce qu'un bail neuf reprend : la ligne de l'agence, sinon le catalogue. */
    public function lateFeeGraceDays(?int $agencyId): int
    {
        $value = $this->agencyValue('lease.late_fee_grace_days', $agencyId) ?? $this->platform->getValue('lease.late_fee_grace_days');

        return is_numeric($value)
            ? (int) EditablePlatformSettings::clamp('lease.late_fee_grace_days', (float) $value)
            : self::DEFAULT_LATE_FEE_GRACE_DAYS;
    }

    private function contractType(Property $property): ?ContractType
    {
        return $property->contract_type instanceof ContractType
            ? $property->contract_type
            : ContractType::tryFrom((string) $property->contract_type);
    }

    private function leaseType(Property $property): LeaseType
    {
        if ($this->contractType($property) === ContractType::Sale) {
            return LeaseType::Sale;
        }

        $type = $property->type instanceof PropertyType ? $property->type : PropertyType::tryFrom((string) $property->type);

        return in_array($type, self::COMMERCIAL_TYPES, true) ? LeaseType::CommercialRent : LeaseType::ResidentialRent;
    }

    /** @return array<string, mixed>|null */
    private function entryCost(Property $property): ?array
    {
        $cout = CoutDEntree::pour($property);
        if ($cout === null) {
            return null;
        }
        $cout['total'] = $this->number((float) $cout['total']);
        if ($cout['monthly_charges'] !== null) {
            $cout['monthly_charges'] = $this->number((float) $cout['monthly_charges']);
        }
        if ($cout['agency_fee_months'] !== null) {
            $cout['agency_fee_months'] = $this->number((float) $cout['agency_fee_months']);
        }

        return $cout;
    }

    /** @return array{value: mixed, source: string} */
    private function fromProperty(mixed $value): array
    {
        return ['value' => $value, 'source' => self::SOURCE_PROPERTY];
    }

    /** @return array{value: mixed, source: string} */
    private function scoped(string $key, ?int $agencyId, mixed $value): array
    {
        return [
            'value' => $value,
            'source' => $this->agencyValue($key, $agencyId) !== null ? self::SOURCE_AGENCY : self::SOURCE_PLATFORM,
        ];
    }

    /**
     * La valeur propre à l'agence, déballée par le lecteur unique (TCK-778) ; `null` quand l'agence
     * n'a pas de ligne, ou une ligne sans valeur numérique (`{"value": null}`, `{}` : r6, vérification
     * de TCK-2643). Le global passé à `value()` est un témoin, qu'il ne rend tel quel que sans ligne
     * d'agence : la ligne n'est jamais déballée ici. Les quatre clés que ce service lit sont numériques.
     */
    private function agencyValue(string $key, ?int $agencyId): int|float|string|null
    {
        $temoin = new \stdClass;
        $value = ScopedSetting::value($key, $agencyId, $temoin);

        return $value !== $temoin && is_numeric($value) ? $value : null;
    }

    /** Un montant arrondi à l'unité de sa devise (principe n° 3 : aucune décimale en F CFA). */
    private function amount(float $value, string $currency): float|int
    {
        return $this->number(round($value, Currency::decimalPlacesOf($currency), PHP_ROUND_HALF_UP));
    }

    /** Un nombre entier se rend entier : `670000`, jamais `670000.0`. */
    private function number(float $value): float|int
    {
        return floor($value) === $value ? (int) $value : $value;
    }
}
