<?php

namespace App\Models\Bases;

use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Trait to wire a model into spatie/laravel-activitylog with a consistent
 * configuration: log only dirty fields, don't emit empty logs, use the short
 * class name as the log_name.
 *
 * TCK-601 (ADR-0044 §3) — un modèle qui déclare `AUDIT_ONLY` est journalisé en LISTE BLANCHE :
 * seules ces colonnes entrent dans `attribute_changes`. Sans elle, tout le `fillable` y entre — ce
 * qui, posé tel quel sur un profil de bailleur, écrirait son RIB en clair dans le journal. Tout
 * modèle qui porte une donnée personnelle ou un secret déclare donc sa liste.
 */
trait Auditable
{
    use LogsActivity;

    public function getActivitylogOptions(): LogOptions
    {
        $options = defined(static::class.'::AUDIT_ONLY')
            ? LogOptions::defaults()->logOnly(static::AUDIT_ONLY)
            : LogOptions::defaults()->logFillable();

        return $options
            ->logOnlyDirty()
            ->dontLogEmptyChanges()
            ->useLogName(class_basename(static::class));
    }
}
