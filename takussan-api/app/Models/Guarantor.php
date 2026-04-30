<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\IdType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Guarantor extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'first_name', 'last_name', 'phone', 'email',
        'id_type', 'id_number', 'occupation', 'employer',
        'monthly_income', 'relationship_to_tenant',
        'added_by_id', 'notes', 'metadata',
    ];

    protected $casts = [
        'id_type' => IdType::class,
        'monthly_income' => 'decimal:2',
        'metadata' => 'array',
    ];

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by_id');
    }

    public function leases(): HasMany
    {
        return $this->hasMany(Lease::class);
    }

    public function leasesPivot(): BelongsToMany
    {
        return $this->belongsToMany(Lease::class, 'lease_guarantor')
            ->withPivot(['role'])
            ->withTimestamps();
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }
}
