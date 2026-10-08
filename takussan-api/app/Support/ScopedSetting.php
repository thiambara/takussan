<?php

namespace App\Support;

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
 */
final class ScopedSetting
{
    public static function row(string $key, ?int $agencyId): ?Setting
    {
        if ($agencyId !== null) {
            $agence = Setting::query()
                ->where('key', $key)
                ->where('scope', SettingScope::Agency)
                ->where('scope_id', $agencyId)
                ->first();
            if ($agence !== null) {
                return $agence;
            }
        }

        return Setting::query()
            ->where('key', $key)
            ->where('scope', SettingScope::Global)
            ->whereNull('scope_id')
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
