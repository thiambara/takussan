<?php

namespace App\Models\Bases;

use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Trait to wire a model into spatie/laravel-activitylog with a consistent
 * configuration: log only dirty fillable fields, don't emit empty logs,
 * use the short class name as the log_name.
 */
trait Auditable
{
    use LogsActivity;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logFillable()
            ->logOnlyDirty()
            ->dontLogEmptyChanges()
            ->useLogName(class_basename(static::class));
    }
}
