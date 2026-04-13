<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Agency extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $table = 'agencies';

    protected $fillable = [
        'name',
        'slug',
        'license_number',
        'email',
        'phone',
        'website',
        'logo_path',
        'description',
        'status',
        'settings',
        'metadata'
    ];

    protected $casts = [
        'settings' => 'array',
        'metadata' => 'array',
    ];

    // RELATIONSHIPS

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }
}
