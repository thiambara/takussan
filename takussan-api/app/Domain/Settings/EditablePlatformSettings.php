<?php

namespace App\Domain\Settings;

use App\Services\Invoice\OverdueReminderService;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\RentReviewService;
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
 * `StoreAgencyRequest`, `AgencyUpdateRequest` ; `platform.session_max_minutes` →
 * `SessionTokenIssuer` ; `credits.*` et `boost.*` (TCK-633) → `App\Services\Boost\BoostSettings`.
 *
 * TCK-651 (ADR-0065) — catégorie `rentals` : les cinq réglages métier à repli par agence
 * (`App\Support\ScopedSetting`). Leur valeur GLOBALE ne s'écrivait que par la route brute
 * `/api/settings`, sans règle ni journal ; elle s'écrit ici, et seulement ici. La ligne d'une agence
 * l'emporte toujours. **Le défaut est la constante du service**, référencée : deux défauts qui
 * divergent feraient lire deux valeurs selon le chemin. Lecteurs : `OverdueReminderService`,
 * `RentReviewService`, `EarlyTerminationService`, `LeaseRenewalService`, `LateFeeCalculator`.
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
                'rules' => ['required', 'array', 'min:1'],
                'item_rules' => ['string', Rule::in(self::CURRENCIES)],
            ],
            'platform.session_max_minutes' => [
                'category' => 'limits',
                'type' => 'integer',
                'default' => 480,
                'public' => false,
                'requires_restart' => true,
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
            'lease.early_termination_penalty_months' => [
                'category' => 'rentals', 'type' => 'integer',
                'default' => EarlyTerminationService::SETTING_DEFAULT_MONTHS, 'public' => false,
                'rules' => ['required', 'integer', 'min:1', 'max:24'],
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
