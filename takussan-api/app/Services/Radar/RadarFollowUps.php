<?php

namespace App\Services\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\RadarOutreach;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * TCK-2388 (décision 4, porteur 2026-10-28) — la file « à relancer ». Un message y entre quand il est le DERNIER de sa
 * chaîne (aucune relance ENVOYÉE ne le suit : un brouillon de relance ne ferme rien), envoyé, sans issue, depuis au
 * moins `radar.follow_ups.after_days` jours, et qu'au moins une de ses annonces est encore `contacted`.
 * `proposesNoAnswer()` : il a déjà `radar.follow_ups.max` relances derrière lui et son échéance est passée.
 * « En attente » : les mêmes, avant l'échéance.
 *
 * Les seules requêtes de la file, réemployées par la liste des annonceurs, le tableau de bord et la fiche ; les deux
 * chiffres ne se lisent qu'ici (`config('radar.follow_ups')`).
 */
final class RadarFollowUps
{
    /** @return Builder<RadarOutreach> */
    public function open(): Builder
    {
        return $this->constrainOpen(RadarOutreach::query());
    }

    /**
     * La définition de « ouvert » sur une requête de messages donnée (la racine, ou une relation chargée).
     *
     * @param  Builder<RadarOutreach>|Relation<RadarOutreach, *, *>  $query
     * @return Builder<RadarOutreach>|Relation<RadarOutreach, *, *>
     */
    public function constrainOpen(Builder|Relation $query): Builder|Relation
    {
        return $query
            ->whereNotNull('radar_outreaches.sent_at')->whereNull('radar_outreaches.outcome')
            // `sent_at` NU : la relation vise la même table, la sous-requête la renomme (`laravel_reserved_N`) et un nom
            // qualifié `radar_outreaches.sent_at` y désignerait le message d'ORIGINE, toujours envoyé.
            ->whereDoesntHave('followUp', fn (Builder $q) => $q->whereNotNull('sent_at'))
            ->whereHas('listings', fn (Builder $q) => $q->where('radar_listings.stage', RadarListingStage::Contacted->value));
    }

    /** @return Builder<RadarOutreach> */
    public function due(): Builder
    {
        return $this->open()->where('radar_outreaches.sent_at', '<=', now()->subDays($this->afterDays()));
    }

    /** @return Builder<RadarOutreach> */
    public function awaiting(): Builder
    {
        return $this->open()->where('radar_outreaches.sent_at', '>', now()->subDays($this->afterDays()));
    }

    public function dueAt(RadarOutreach $outreach): CarbonInterface
    {
        return $outreach->sent_at->copy()->addDays($this->afterDays());
    }

    /**
     * La file propose « sans réponse » : le message a déjà `max` relances derrière lui ET son échéance est passée.
     * Une relance de dernier rang envoyée hier attend encore sa réponse : elle ne propose rien.
     */
    public function proposesNoAnswer(RadarOutreach $outreach): bool
    {
        return $outreach->sent_at !== null
            && $this->atLimit($outreach)
            && ! $this->dueAt($outreach)->isFuture();
    }

    /** Ce message a déjà `max` relances derrière lui : on n'en prépare pas une de plus. */
    public function atLimit(RadarOutreach $outreach): bool
    {
        return $outreach->follow_up_rank >= (int) config('radar.follow_ups.max');
    }

    private function afterDays(): int
    {
        return (int) config('radar.follow_ups.after_days');
    }
}
