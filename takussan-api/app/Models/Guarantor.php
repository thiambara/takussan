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

    /**
     * TCK-954 (ADR-0070 § 1 et 3) — la pièce et le revenu : chiffrés (casts `encrypted`, colonnes
     * `text`) et absents de toute sérialisation par défaut (`$hidden`). Ils ne sortent que masqués
     * (`GuarantorController::format`). Le revenu se relit donc comme une chaîne : un cast
     * `encrypted` simple, jamais une classe maison, sans quoi `backup:verify-encryption` ne verrait
     * plus la colonne.
     */
    public const SENSITIVE = ['id_number', 'monthly_income'];

    protected $hidden = self::SENSITIVE;

    protected $fillable = [
        'first_name', 'last_name', 'phone', 'email',
        'id_type', 'id_number', 'occupation', 'employer',
        'monthly_income', 'relationship_to_tenant',
        'added_by_id', 'notes', 'metadata',
    ];

    protected $casts = [
        'id_type' => IdType::class,
        'id_number' => 'encrypted',
        'monthly_income' => 'encrypted',
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
