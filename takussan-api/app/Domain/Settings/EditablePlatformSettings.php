<?php

namespace App\Domain\Settings;

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
        ];
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

    /**
     * TCK-600 — une clé de portée `global` que seul un catalogue écrit : celui-ci, ou celui des
     * énumérations métier (`enum.<clé>.values`, `BusinessEnumService`). La route générique des
     * paramètres les écrivait sans leurs règles (une devise par défaut en TABLEAU passait).
     */
    public static function managedByCatalogue(string $key): bool
    {
        return self::has($key) || str_starts_with($key, 'enum.');
    }
}
