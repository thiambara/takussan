<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Propriety extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $table = 'properties';

    protected $casts = [
        'servicing' => 'array',
    ];
    protected $fillable = [
        'parent_id',
        'user_id',

        // Informations générales
        'title',
        'description',
        'type',
        'status',
        'visibility',

        // Attributs spécifiques aux propriétés physiques
        'price',
        'area',
        'position',
        'level',
        'title_type',
        'with_administrative_monitoring',
        'contract_type',

        // Informations techniques et services
        'servicing',
        'metadata'
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function address(): MorphOne
    {
        return $this->morphOne(Address::class, 'addressable');
    }

    public function subProprieties(): HasMany
    {
        return $this->hasMany(Propriety::class);
    }

    public function supperPropriety(): BelongsTo
    {
        return $this->belongsTo(Propriety::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

}
