<?php

namespace App\Domain\Settings;

use App\Models\Enums\WatermarkPosition;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

/**
 * TCK-970 (P47.08) — LA liste des réglages d'agence (`agencies.settings`) qu'un admin écrit par
 * `PATCH /api/agencies/{id}` : leur type, leur défaut et leur règle, écrits une fois.
 *
 * `AgencyUpdateRequest` en tire ses règles `settings.*`, et `Agency::setting()` les lit. Avant,
 * chaque lecteur portait sa coercition : `TenantOnboardingService` ne coupait la checklist que sur
 * `=== false`, alors que la règle `boolean` laisse écrire `0`.
 *
 * Les autres clés que l'onboarding dépose dans `settings` (`primary_city`, `onboarding_source`…)
 * n'y sont pas : aucun écran ne les écrit, et `AgencyResource` les retire.
 */
final class AgencySettings
{
    private const BOOL = 'bool';

    private const INT = 'int';

    private const STRING = 'string';

    /**
     * @return array<string, array{type: string, default: mixed, rules: array<int, mixed>}>
     */
    private static function catalog(): array
    {
        return [
            'watermark_enabled' => [
                'type' => self::BOOL, 'default' => true,
                'rules' => ['sometimes', 'boolean'],
            ],
            'watermark_position' => [
                'type' => self::STRING, 'default' => WatermarkPosition::default()->value,
                'rules' => ['sometimes', Rule::enum(WatermarkPosition::class)],
            ],
            'watermark_opacity' => [
                'type' => self::INT, 'default' => 60,
                'rules' => ['sometimes', 'integer', 'between:10,100'],
            ],
            // TCK-589 — 2FA exigée de tout le personnel de l'agence (contrainte 7).
            'require_team_two_factor' => [
                'type' => self::BOOL, 'default' => false,
                'rules' => ['sometimes', 'boolean'],
            ],
            // TCK-593 — absent = `false` (`Agency::collectsLateFeesOnline()`).
            'late_fee_online_collection' => [
                'type' => self::BOOL, 'default' => false,
                'rules' => ['sometimes', 'nullable', 'boolean'],
            ],
            // TCK-963 — `BookingExpirationService` (0 = désactivé, features.md § 1.3). `null` retire
            // la clé : le défaut revient.
            'booking_pending_expiry_hours' => [
                'type' => self::INT, 'default' => 48,
                'rules' => ['sometimes', 'nullable', 'integer', 'between:0,168'],
            ],
            // TCK-963 — `TenantOnboardingService` ; `false` comme `0` coupent la checklist (TCK-970).
            'tenant_onboarding_enabled' => [
                'type' => self::BOOL, 'default' => true,
                'rules' => ['sometimes', 'nullable', 'boolean'],
            ],
        ];
    }

    /**
     * @return list<string>
     */
    public static function keys(): array
    {
        return array_keys(self::catalog());
    }

    /**
     * Les règles de `AgencyUpdateRequest`, préfixées `settings.`.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function rules(): array
    {
        $rules = [];
        foreach (self::catalog() as $key => $entry) {
            $rules["settings.{$key}"] = $entry['rules'];
        }

        return $rules;
    }

    public static function default(string $key): mixed
    {
        return self::entry($key)['default'];
    }

    /**
     * La valeur d'un réglage, dans son type, lue sur des `settings` bruts (une ligne lue sans
     * hydrater le modèle, ou l'état d'origine qu'un observateur compare). Absente, `null` ou
     * illisible dans son type : le défaut.
     *
     * @param  array<string, mixed>|null  $settings
     */
    public static function read(?array $settings, string $key): mixed
    {
        $entry = self::entry($key);
        $value = $settings[$key] ?? null;

        // ⚠ Avant `filter_var` : il lit `null` comme `""`, donc `false`, et un réglage absent
        // vaudrait faux au lieu de son défaut.
        if (! is_scalar($value)) {
            return $entry['default'];
        }

        $typed = match ($entry['type']) {
            self::BOOL => is_bool($value) ? $value : filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE),
            self::INT => is_int($value) ? $value : (is_numeric($value) ? (int) $value : null),
            self::STRING => is_string($value) ? $value : null,
        };

        return $typed ?? $entry['default'];
    }

    /**
     * @return array{type: string, default: mixed, rules: array<int, mixed>}
     */
    private static function entry(string $key): array
    {
        return self::catalog()[$key]
            ?? throw new InvalidArgumentException("Réglage d'agence inconnu : {$key}. Il se déclare dans AgencySettings, avec sa règle.");
    }
}
