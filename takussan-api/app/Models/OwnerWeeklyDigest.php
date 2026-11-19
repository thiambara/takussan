<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;

/**
 * TCK-2985 (ADR-0132 § 6) — un résumé du lundi envoyé : un par (bailleur, agence, semaine ISO). Écrit par
 * `App\Services\Owners\ResumeDuLundi` seul ; aucune route ne le lit.
 */
class OwnerWeeklyDigest extends AbstractModel
{
    protected $table = 'owner_weekly_digests';

    protected $fillable = ['user_id', 'agency_id', 'week', 'channel', 'sent_at'];

    protected $casts = ['sent_at' => 'datetime'];
}
