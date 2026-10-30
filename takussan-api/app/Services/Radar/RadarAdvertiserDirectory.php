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
        $existing = RadarAdvertiser::query()->where('phone_hmac', $hmac)->first() ?? $this->underPreviousKey($e164);
        if ($existing !== null) {
            return $this->restorePhone($existing, $e164);
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
     * TCK-2391 — un annonceur purgé SANS refus (ses annonces effacées, son numéro avec) qui revient récupère son numéro : la
     * publication et le lien `wa.me` partent de `phone`. Celui qui a dit STOP ne le récupère jamais : son annonce naît
     * `do_not_contact` et seule l'empreinte lui sert.
     *
     * Public pour l'appelant qui relit l'annonceur SOUS VERROU après `findOrCreate()` : une purge qui a pris le verrou entre les deux
     * ne voyait pas encore l'annonce, et a effacé le numéro que `findOrCreate()` venait de rendre.
     */
    public function restorePhone(RadarAdvertiser $advertiser, string $e164): RadarAdvertiser
    {
        if ($advertiser->phone === null && $advertiser->do_not_contact_at === null) {
            $advertiser->forceFill(['phone' => $e164])->save();
        }

        return $advertiser;
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
            ->whereIn('phone_hmac', array_merge(...array_map(RadarPhone::hmacs(...), $e164)))
            ->whereNotNull('do_not_contact_at')
            ->orderBy('id')
            ->first();
    }

    /**
     * TCK-2414 — l'annonceur de ce numéro sous une ANCIENNE clé ({@see RadarPhone::hmacs()}) : un refus purgé écrit avant la
     * pose ou la rotation de la clé. Retrouvé, son empreinte passe sous la clé courante — le numéro est là pour la calculer.
     */
    private function underPreviousKey(string $e164): ?RadarAdvertiser
    {
        $previous = array_slice(RadarPhone::hmacs($e164), 1);
        $advertiser = $previous === [] ? null : RadarAdvertiser::query()->whereIn('phone_hmac', $previous)->orderBy('id')->first();
        $advertiser?->forceFill(['phone_hmac' => RadarPhone::hmac($e164)])->save();

        return $advertiser;
    }
}
