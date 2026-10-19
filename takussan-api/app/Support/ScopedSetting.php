<?php

namespace App\Support;

use App\Domain\Settings\EditablePlatformSettings;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use Illuminate\Support\Collection;

/**
 * TCK-600 (verif-600 H1) — LE lecteur d'un réglage métier de `settings` : celui de l'agence
 * concernée, sinon le réglage global, sinon `null` (le lecteur applique alors son défaut).
 *
 * Cinq services lisaient `Setting::where('key', …)->first()` SANS PORTÉE : la première ligne venue
 * gagnait, et un admin d'agence qui posait `invoice.reminder_offsets_days` dans SON agence
 * (`POST /api/settings`, `scope=agency`) le réécrivait pour toutes les agences de la plateforme.
 *
 * Une ligne d'agence ne vaut que pour son agence ; un lecteur sans agence en contexte ne lit que le
 * global. `SettingController` ne laisse un admin d'agence écrire que dans son agence.
 *
 * TCK-651 (ADR-0065) — le global et le défaut viennent du catalogue (`EditablePlatformSettings`,
 * catégorie `rentals`).
 *
 * TCK-778 (P13.07) — chaque lecteur passe par `value()`, qui porte le déballage : il était recopié
 * dans cinq services.
 */
final class ScopedSetting
{
    /**
     * TCK-778 (P13.07) — LA valeur d'un réglage métier pour une agence : sa ligne, sinon la valeur
     * globale du catalogue, qui porte le défaut. Déballée ici, et nulle part ailleurs.
     *
     * La valeur globale est passée par le lecteur (`getValue('<clé>')`, en toutes lettres) : c'est
     * ce littéral que `scripts/check-platform-catalogue-readers.mjs` reconnaît comme le lecteur
     * d'une clé du catalogue.
     *
     * Une ligne d'agence est un objet JSON (`StoreSettingRequest` exige un tableau) :
     * - `{"value": x}` rend `x` ;
     * - pour une clé que le catalogue type liste (`integer_list`), tout autre tableau est la liste
     *   elle-même ;
     * - pour une clé scalaire, la première valeur : la forme héritée `{"months": 3}` rend `3`.
     */
    public static function value(string $key, ?int $agencyId, mixed $global): mixed
    {
        return self::unwrap($key, self::agencyRow($key, $agencyId)?->value ?? $global);
    }

    /**
     * TCK-964 (P47.04) — le déballage seul, que `StoreSettingRequest` applique aussi avant de juger
     * une ligne d'agence : la valeur validée est celle que `value()` rendra.
     */
    public static function unwrap(string $key, mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (str_ends_with((string) (EditablePlatformSettings::get($key)['type'] ?? ''), '_list')) {
            return array_key_exists('value', $value) ? $value['value'] : $value;
        }

        return $value['value'] ?? array_values($value)[0] ?? null;
    }

    /**
     * TCK-651 (ADR-0065) — la ligne de l'agence seule. Sans elle, le lecteur lit la valeur globale
     * par le catalogue (`PlatformSettingService::getValue('<clé>')`), qui porte le défaut : la ligne
     * globale ne se lit plus ici, elle ne s'écrit plus que par le catalogue.
     */
    public static function agencyRow(string $key, ?int $agencyId): ?Setting
    {
        if ($agencyId === null) {
            return null;
        }

        return Setting::query()
            ->where('key', $key)
            ->where('scope', SettingScope::Agency)
            ->where('scope_id', $agencyId)
            ->first();
    }

    /**
     * Toutes les lignes d'agence d'une clé — pour un balayage qui couvre toutes les agences à la
     * fois et doit donc considérer la valeur de chacune.
     *
     * @return Collection<int, Setting>
     */
    public static function agencyRows(string $key): Collection
    {
        return Setting::query()
            ->where('key', $key)
            ->where('scope', SettingScope::Agency)
            ->get();
    }
}
