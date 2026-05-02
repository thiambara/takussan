<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\IdType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\User;
use Database\Factories\Profiles\OwnerProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class OwnerProfile extends AbstractModel
{
    /** @use HasFactory<OwnerProfileFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'agency_id', 'status',
        'rib', 'tax_id',
        'id_document_type', 'id_document_number',
        'monthly_income', 'employer',
        'guarantor_user_id', 'metadata',
    ];

    protected $casts = [
        'status' => OwnerProfileStatus::class,
        'id_document_type' => IdType::class,
        'monthly_income' => 'decimal:2',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function guarantor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'guarantor_user_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', OwnerProfileStatus::Active->value);
    }

    public function scopeWithinAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }
}
