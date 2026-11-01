<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarAdvertiserNature;

/**
 * TCK-2431 (ADR-0077 §9, ADR-0083) — un compteur anonyme : ce jour-là, `advertisers` annonceurs de cette nature présumée
 * portaient `listings` annonces non purgées et non doublons. Écrit chaque jour avant la purge par
 * `App\Services\Radar\Observatory\RadarNatureCounter`, lu par l'observatoire (`nature_history`) pour la part par nature
 * d'une période, au-delà de la purge.
 *
 * Ni identifiant, ni lieu, ni prix, ni site, ni horodatation : le jour, la nature, deux nombres. Jamais purgé.
 */
class RadarNatureCount extends AbstractModel
{
    public $timestamps = false;

    protected $fillable = ['day', 'nature', 'advertisers', 'listings'];

    protected $casts = [
        'day' => 'date',
        'nature' => RadarAdvertiserNature::class,
        'advertisers' => 'integer',
        'listings' => 'integer',
    ];

    protected static array $queryFields = ['id', 'day', 'nature', 'advertisers', 'listings'];
}
