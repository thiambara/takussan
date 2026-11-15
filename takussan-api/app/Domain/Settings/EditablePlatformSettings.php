<?php

namespace App\Domain\Settings;

use App\Services\Crm\CustomerFollowUpQuery;
use App\Services\Invoice\OverdueReminderService;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LeaseDefaults;
use App\Services\Lease\RentReviewService;
use App\Support\ScopedSetting;
use Illuminate\Validation\Rule;

/**
 * Le catalogue des paramètres plateforme que la console édite.
 *
 * TCK-600 — **réduit aux clés qu'un code lit** : six des neuf clés (`format.*`,
 * `platform.timezone_default`, `transaction.platform_fee_*`, `platform.max_upload_mb`) s'éditaient,
 * se journalisaient et ne pilotaient rien. Une clé n'entre ici qu'avec son lecteur ; la garde
 * `scripts/check-platform-catalogue-readers.mjs` le vérifie. Les libellés ne sont plus servis par
 * l'API : le front les traduit par clé (`superAdmin.settings.keys.<clé>`).
 *
 * Lecteurs : `currency.default` → `PaymentGatewayService` ; `currency.supported` →
 * `AgencyUpdateRequest` ; `platform.session_max_minutes` →
 * `SessionTokenIssuer` ; `credits.*` et `boost.*` (TCK-633) → `App\Services\Boost\BoostSettings`.
 *
 * TCK-651 (ADR-0065) — catégorie `rentals` : les cinq réglages métier à repli par agence
 * (`App\Support\ScopedSetting`). Leur valeur GLOBALE ne s'écrivait que par la route brute
 * `/api/settings`, sans règle ni journal ; elle s'écrit ici, et seulement ici. La ligne d'une agence
 * l'emporte toujours. **Le défaut est la constante du service**, référencée : deux défauts qui
 * divergent feraient lire deux valeurs selon le chemin. Lecteurs : `OverdueReminderService`,
 * `RentReviewService`, `EarlyTerminationService`, `LeaseRenewalService`, `LateFeeCalculator`,
 * et `LeaseDefaults` pour `lease.late_fee_*` (TCK-2643, préremplissage d'un bail neuf).
 *
 * TCK-2394 (ADR-0079) — catégorie `radar` : `radar.mandate_agency_id` → `App\Services\Radar\RadarMandate`.
 */
class EditablePlatformSettings
{
    public const CURRENCIES = ['XOF', 'EUR', 'USD'];

    /**
     * @return array<string,array<string,mixed>>
     */
    public static function all(): array
    {
        return [
            'currency.default' => [
                'category' => 'currency',
                'type' => 'select',
                'default' => 'XOF',
                'public' => true,
                'options' => self::CURRENCIES,
                'rules' => ['required', 'string', Rule::in(self::CURRENCIES)],
            ],
            'currency.supported' => [
                'category' => 'currency',
                'type' => 'multi_select',
                'default' => ['XOF', 'EUR', 'USD'],
                'public' => true,
                'options' => self::CURRENCIES,
                // TCK-2488 — au plus chaque devise une fois : la borne vient de la liste fermée.
                'rules' => ['required', 'array', 'min:1', 'max:'.count(self::CURRENCIES)],
                'item_rules' => ['string', Rule::in(self::CURRENCIES)],
            ],
            'platform.session_max_minutes' => [
                'category' => 'limits',
                'type' => 'integer',
                'default' => 480,
                // P98.10 (TCK-1176) — sans `requires_restart` : lu à chaque émission de jeton d'un
                // super-admin (`SessionTokenIssuer`), derrière le cache du catalogue.
                'public' => false,
                'rules' => ['required', 'integer', 'min:15', 'max:1440'],
            ],
            // TCK-633 lot F (ADR-0061 §6) — crédits et mise en avant. Lus par `App\Services\Boost\BoostSettings`.
            'credits.welcome_amount' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 500, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:100000'],
            ],
            'credits.welcome_validity_days' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 180, 'public' => false,
                'rules' => ['required', 'integer', 'min:1', 'max:3650'],
            ],
            'credits.expiry_notice_days' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 7, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:90'],
            ],
            'boost.bump_cooldown_hours' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 24, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:720'],
            ],
            'boost.sponsored_slots_per_page' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 3, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:10'],
            ],
            'boost.reserved_top_results' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 2, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:10'],
            ],
            // TCK-651 (ADR-0065) — réglages métier à repli par agence, lus par `ScopedSetting` + `getValue`.
            'invoice.reminder_offsets_days' => [
                'category' => 'rentals', 'type' => 'integer_list',
                'default' => OverdueReminderService::DEFAULT_OFFSETS, 'public' => false,
                'rules' => ['required', 'array', 'min:1', 'max:10'],
                'item_rules' => ['integer', 'min:1', 'max:365'],
            ],
            'lease.rent_review_max_pct' => [
                'category' => 'rentals', 'type' => 'decimal',
                'default' => RentReviewService::DEFAULT_MAX_PCT, 'public' => false,
                'rules' => ['required', 'numeric', 'gt:0', 'max:100'],
            ],
            // TCK-2842 — LA borne de l'indemnité de départ anticipé, déclarée ici seulement : la
            // validation du bail (`StoreLeaseRequest`, `UpdateLeaseRequest`, `RenewLeaseRequest`, par
            // `reglesDeBornes()`), le préremplissage (`LeaseDefaults`) et la lecture à l'exécution
            // (`EarlyTerminationService::resolvePenaltyMonths`, par `clamp()`) la lisent. 0 = aucune
            // indemnité, valable pour une agence comme pour un bail ; 12, la borne que les baux portaient.
            'lease.early_termination_penalty_months' => [
                'category' => 'rentals', 'type' => 'integer',
                'default' => EarlyTerminationService::SETTING_DEFAULT_MONTHS, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:12'],
            ],
            'lease.require_signature' => [
                'category' => 'rentals', 'type' => 'boolean', 'default' => false, 'public' => false,
                'rules' => ['present', 'boolean'],
            ],
            // `null` : aucun plafond (`LateFeeCalculator::capPercent`). Vide se lit « aucun plafond », pas 0.
            'late_fees.cap_percent' => [
                'category' => 'rentals', 'type' => 'decimal', 'nullable' => true,
                'default' => null, 'public' => false,
                'rules' => ['present', 'nullable', 'numeric', 'min:0', 'max:100'],
            ],
            // TCK-2643 — APRÈS le plafond : la catégorie se rend dans cet ordre, et `late_fees.cap_percent`
            // garde son rang (`RentalSettingsCatalogueTest` le lit en `data.rentals.4`).
            // La pénalité de retard qu'un bail NEUF reprend (`LeaseDefaults`, préremplissage
            // seul : `LateFeeCalculator` lit la colonne du bail). Défaut 0 = pas de pénalité (décision de
            // la session du 2026-11-12) ; bornes = celles du bail (`StoreLeaseRequest`, `UpdateLeaseRequest`).
            'lease.late_fee_percent' => [
                'category' => 'rentals', 'type' => 'decimal',
                'default' => LeaseDefaults::DEFAULT_LATE_FEE_PERCENT, 'public' => false,
                'rules' => ['required', 'numeric', 'min:0', 'max:50'],
            ],
            'lease.late_fee_grace_days' => [
                'category' => 'rentals', 'type' => 'integer',
                'default' => LeaseDefaults::DEFAULT_LATE_FEE_GRACE_DAYS, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:30'],
            ],
            // TCK-2394 (ADR-0079, proposé) — l'espace où le Radar publie sous mandat, par son identifiant ; 0 : aucun. Lu par
            // `App\Services\Radar\RadarMandate`, et seulement drapeau `radar_mandate` allumé.
            'radar.mandate_agency_id' => [
                'category' => 'radar', 'type' => 'integer', 'default' => 0, 'public' => false,
                'rules' => ['required', 'integer', 'min:0'],
            ],
            // TCK-2588 (ADR-0103 § 4) — le seuil de la relance « sans contact » d'une fiche d'une étape
            // vivante. Lu par `App\Services\Crm\CustomerFollowUpQuery`, ligne d'agence d'abord.
            'crm.follow_up_days' => [
                'category' => 'crm', 'type' => 'integer',
                'default' => CustomerFollowUpQuery::DEFAULT_DAYS, 'public' => false,
                'rules' => ['required', 'integer', 'min:1', 'max:90'],
            ],
        ];
    }

    /**
     * TCK-964 (P47.04) — ramène une valeur lue dans les bornes `min:`/`max:` des `rules` de sa clé.
     * Les lecteurs l'appliquent à la ligne d'agence comme à la globale : une valeur écrite hors
     * borne avant que la ligne d'agence soit validée retombe sur la borne. Les bornes ne
     * s'écrivent qu'ici, dans les règles.
     */
    public static function clamp(string $key, float $value): float
    {
        foreach (self::get($key)['rules'] as $rule) {
            if (is_string($rule) && preg_match('/^(min|max):(-?[0-9.]+)$/', $rule, $m) === 1) {
                $value = $m[1] === 'min' ? max($value, (float) $m[2]) : min($value, (float) $m[2]);
            }
        }

        return $value;
    }

    /**
     * r6 (r1 de la vérification de 65d3142b6) — la valeur atteint-elle le PLANCHER des règles de la clé
     * (`min:x` : au moins x ; `gt:x` : plus que x) ? Une ligne d'agence sous le plancher n'est pas un
     * réglage ({@see ScopedSetting::numericAgencyValue()}) : `{"value": 0}` sur une clé
     * en `min:1` ou `gt:0` est une ligne écrite avant sa règle, et le global reprend la main. Au-dessus
     * du plafond, {@see self::clamp()} la ramène : la ligne dit bien quelque chose de l'agence.
     */
    public static function atteintLePlancher(string $key, float $value): bool
    {
        foreach (self::get($key)['rules'] as $rule) {
            if (is_string($rule) && preg_match('/^(min|gt):(-?[0-9.]+)$/', $rule, $m) === 1) {
                if ($m[1] === 'min' ? $value < (float) $m[2] : $value <= (float) $m[2]) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * TCK-2842 — la borne `min` (`min:x` ou `gt:x`) ou `max` des règles de la clé, `null` sans elle.
     */
    public static function borne(string $key, string $quelle): int|float|null
    {
        $motif = $quelle === 'max' ? 'max' : 'min|gt';
        foreach (self::get($key)['rules'] as $rule) {
            if (is_string($rule) && preg_match('/^('.$motif.'):(-?[0-9.]+)$/', $rule, $m) === 1) {
                return str_contains($m[2], '.') ? (float) $m[2] : (int) $m[2];
            }
        }

        return null;
    }

    /**
     * TCK-2842 — les règles de bornes de la clé (`min:`, `gt:`, `max:`), telles quelles, pour qu'une
     * autre validation (celle du bail) applique la borne du catalogue au lieu de la recopier.
     *
     * @return list<string>
     */
    public static function reglesDeBornes(string $key): array
    {
        return array_values(array_filter(
            self::get($key)['rules'],
            fn (mixed $rule) => is_string($rule) && preg_match('/^(min|gt|max):-?[0-9.]+$/', $rule) === 1,
        ));
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::all());
    }

    /**
     * @return array<string,mixed>
     */
    public static function get(string $key): array
    {
        return self::all()[$key];
    }
}
