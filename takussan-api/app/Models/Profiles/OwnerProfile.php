<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Concerns\HasAgencyRole;
use App\Models\Enums\IdType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\User;
use Database\Factories\Profiles\OwnerProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class OwnerProfile extends AbstractModel
{
    /** @use HasFactory<OwnerProfileFactory> */
    use HasAgencyRole, HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'agency_id', 'agency_role_id', 'status',
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

    /**
     * spatie/laravel-query-builder hooks. Listing surfaces (`/app/owners`,
     * select propriétaire dans le form de création de bien) consomment ces
     * filtres + sparse fieldsets côté front — voir CLAUDE.md "API —
     * conventions frontend".
     */
    protected static array $requestFilterable = ['status', 'agency_id', 'user_id', 'agency_role_id'];

    protected static array $requestSortable = ['id', 'created_at', 'status'];

    protected static array $requestLoadable = ['user', 'agency', 'invitations', 'agencyRole'];

    protected static array $requestSearchFields = ['rib', 'tax_id', 'employer'];

    protected static array $queryFields = [
        'id', 'user_id', 'agency_id', 'agency_role_id', 'status',
        'rib', 'tax_id', 'id_document_type', 'id_document_number',
        'monthly_income', 'employer', 'guarantor_user_id',
        'metadata', 'created_at', 'updated_at',
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

    /**
     * TCK-256 — invitations émises pour ce profil draft. Utile pour
     * exposer le statut d'invitation (envoyée/expirée) côté UI sans
     * deuxième round-trip.
     */
    public function invitations(): MorphMany
    {
        return $this->morphMany(Invitation::class, 'invitable');
    }

    /**
     * TCK-256 — convenience : email cible du draft, lu depuis le metadata
     * tant qu'aucun User n'est attaché. À l'acceptation, l'invitation
     * crée le User et `user->email` devient l'unique source de vérité.
     */
    public function getDraftEmailAttribute(): ?string
    {
        if ($this->user !== null) {
            return $this->user->email;
        }

        return data_get($this->metadata, 'email');
    }

    /**
     * TCK-256 — convenience : nom complet à afficher pour un draft
     * (avant qu'un User ne soit créé) ou pour un profil actif.
     */
    public function getDisplayNameAttribute(): string
    {
        if ($this->user !== null) {
            return trim(($this->user->first_name ?? '').' '.($this->user->last_name ?? ''));
        }

        $first = (string) data_get($this->metadata, 'first_name', '');
        $last = (string) data_get($this->metadata, 'last_name', '');

        return trim($first.' '.$last);
    }
}
