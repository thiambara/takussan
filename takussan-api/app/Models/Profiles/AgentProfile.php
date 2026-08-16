<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Concerns\HasAgencyRole;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Invitation;
use App\Models\User;
use Database\Factories\Profiles\AgentProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class AgentProfile extends AbstractModel
{
    /** @use HasFactory<AgentProfileFactory> */
    use HasAgencyRole, HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'agency_id', 'agency_role_id', 'status',
        'license_number', 'commission_rate',
        'specialty', 'hire_date', 'active_until',
        'metadata',
    ];

    protected $casts = [
        'status' => AgentProfileStatus::class,
        'commission_rate' => 'decimal:2',
        'hire_date' => 'date',
        'active_until' => 'date',
        'metadata' => 'array',
    ];

    /**
     * spatie/laravel-query-builder hooks. Listing surfaces (`/app/team`)
     * consume these filters + sparse fieldsets côté front — voir CLAUDE.md
     * "API — conventions frontend".
     */
    protected static array $requestFilterable = ['status', 'agency_id', 'user_id', 'agency_role_id'];

    protected static array $requestSortable = ['id', 'created_at', 'status'];

    protected static array $requestLoadable = ['user', 'agency', 'invitations', 'agencyRole'];

    protected static array $requestSearchFields = ['license_number', 'specialty'];

    protected static array $queryFields = [
        'id', 'user_id', 'agency_id', 'agency_role_id', 'status',
        'license_number', 'commission_rate', 'specialty',
        'hire_date', 'active_until', 'metadata',
        'created_at', 'updated_at', 'deleted_at',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', AgentProfileStatus::Active->value);
    }

    public function scopeWithinAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }

    /**
     * TCK-258 — invitations émises pour ce profil draft. Permet d'exposer
     * le statut de l'invitation (sent/expired) côté UI sans round-trip.
     */
    public function invitations(): MorphMany
    {
        return $this->morphMany(Invitation::class, 'invitable');
    }

    /**
     * TCK-258 — convenience : email cible du draft, lu depuis le metadata
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
     * TCK-258 — nom complet à afficher pour un draft (avant qu'un User
     * ne soit créé) ou pour un profil actif.
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
