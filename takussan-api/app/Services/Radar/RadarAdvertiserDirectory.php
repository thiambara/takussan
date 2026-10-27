<?php

namespace App\Services\Radar;

use App\Models\RadarAdvertiser;
use App\Support\RadarPhone;

/**
 * TCK-2386 (ADR-0077 §1, §9) — l'annuaire des annonceurs du Radar, retrouvés par l'empreinte à clé
 * de leur numéro (`phone_hmac`), jamais par le numéro en clair : celui d'un annonceur qui a dit STOP
 * est purgé, son empreinte reste.
 *
 * La seule définition du « numéro qui a dit STOP » : la saisie (`RadarListingIntake`) et le job
 * d'extraction (`ExtractRadarListing`) la lisent ici.
 */
final class RadarAdvertiserDirectory
{
    /**
     * L'annonceur de ce numéro E.164, créé s'il n'existe pas. Deux extractions simultanées du même
     * numéro se règlent par `insertOrIgnore` puis relecture — jamais par une violation d'unicité
     * attrapée, qui abandonnerait la transaction englobante sous PostgreSQL (piège n° 1).
     *
     * `insertOrIgnore` ne passe pas par le modèle : `nature` et `nature_signals` prennent les
     * défauts de la table (`unknown`, `[]`).
     */
    public function findOrCreate(string $e164): RadarAdvertiser
    {
        $hmac = RadarPhone::hmac($e164);
        $existing = RadarAdvertiser::query()->where('phone_hmac', $hmac)->first();
        if ($existing !== null) {
            return $existing;
        }

        $now = now();
        RadarAdvertiser::query()->insertOrIgnore([
            'phone' => $e164,
            'phone_hmac' => $hmac,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        // L'empreinte d'abord ; le numéro en repli : une ligne au même numéro sous une autre
        // empreinte (clé changée) a fait ignorer l'insertion par l'unicité de `phone`.
        return RadarAdvertiser::query()->where('phone_hmac', $hmac)->first()
            ?? RadarAdvertiser::query()->where('phone', $e164)->firstOrFail();
    }

    /**
     * L'annonceur qui a dit STOP pour l'un de ces numéros E.164, s'il y en a un (le plus ancien).
     *
     * @param  list<string>  $e164
     */
    public function refusedAmong(array $e164): ?RadarAdvertiser
    {
        if ($e164 === []) {
            return null;
        }

        return RadarAdvertiser::query()
            ->whereIn('phone_hmac', array_map(RadarPhone::hmac(...), $e164))
            ->whereNotNull('do_not_contact_at')
            ->orderBy('id')
            ->first();
    }
}
