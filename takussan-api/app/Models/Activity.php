<?php

namespace App\Models;

use App\Services\Audit\AuditAgencyResolver;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\Activitylog\Models\Activity as SpatieActivity;

/**
 * TCK-601 (ADR-0044 §3) — une ligne du journal d'audit, rattachée à l'agence de son SUJET.
 *
 * Déclaré dans `config/activitylog.php` : `activity()` et `LogsActivity` écrivent par ce modèle.
 * `agency_id` est résolu à la création par {@see AuditAgencyResolver} ; un admin d'agence ne lit que
 * les lignes de l'agence de son profil actif, le super-admin les lit toutes.
 *
 * ⚠ Les événements de modèle se nomment par CLASSE : un écouteur posé sur la classe spatie
 * (`SpatieActivity::created`) ne voit plus les créations. Ils s'enregistrent ici.
 */
class Activity extends SpatieActivity
{
    protected function casts(): array
    {
        return parent::casts() + ['agency_id' => 'integer'];
    }

    protected static function booted(): void
    {
        static::creating(function (Activity $activity): void {
            if ($activity->getAttribute('agency_id') === null) {
                $activity->setAttribute('agency_id', app(AuditAgencyResolver::class)->resolve($activity));
            }
        });
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }
}
