<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Concerns\HasProfiles;
use App\Models\Enums\RoleDelegationStatus;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoleDelegation extends AbstractModel
{
    use Auditable, HasFactory;

    protected $fillable = [
        'user_id',
        'delegator_id',
        'agency_id',
        'role',
        'starts_at',
        'ends_at',
        'status',
        'reason',
        'user_native_roles_snapshot',
        'activated_at',
        'expired_at',
        'revoked_at',
        'revoked_by',
    ];

    protected $casts = [
        'status' => RoleDelegationStatus::class,
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'activated_at' => 'datetime',
        'expired_at' => 'datetime',
        'revoked_at' => 'datetime',
        'user_native_roles_snapshot' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function delegator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegator_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    /**
     * LA fenêtre d'activité d'une délégation — **source unique** depuis TCK-456.
     *
     * Elle était définie trois fois : ici, dans
     * {@see HasProfiles::hasActiveAgencyDelegation()} et
     * dans {@see MembershipCapabilityResolver::delegationAllows()}.
     * Rien ne les liait, et ce scope divergeait des deux autres **sur les trois
     * axes à la fois** : il exigeait `starts_at` échu, incluait la borne
     * (`ends_at >= now()`) et rejetait `ends_at IS NULL` quand les deux autres
     * l'acceptaient. Les deux autres l'appellent désormais.
     *
     * **C'est la définition PERMISSIVE qui a gagné** — celle qui autorisait
     * déjà —, et c'est ce qui rend la convergence neutre pour l'autorisation :
     * aucun droit ne s'ouvre ni ne se ferme. Adopter l'ancienne clause d'ici
     * aurait RETIRÉ des droits en silence. *Une convergence qui change qui peut
     * faire quoi n'est pas une convergence, c'est une décision d'autorisation
     * déguisée en refactorisation.*
     *
     * ⚠ **La clause `starts_at` est délibérément ABANDONNÉE.** Une délégation
     * qui n'a pas commencé porte le statut `Scheduled` — jamais `Active` :
     * `RoleDelegationService::create()` en répond, et
     * `RoleDelegationActivityWindowTest` le garde. Rattraper ici une ligne
     * `Active` à `starts_at` futur masquerait ce défaut au lieu de l'attraper.
     *
     * ⚠ La branche `ends_at IS NULL` est **morte tant que la colonne est NOT
     * NULL** (elle l'est depuis la migration de création). Elle est conservée
     * parce qu'elle est la sémantique des deux appelants historiques ; un cas
     * de `RoleDelegationActivityWindowTest` rougit le jour où la colonne
     * devient nullable, pour qu'on ajoute la borne au lieu de la découvrir.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', RoleDelegationStatus::Active)
            ->where(function (Builder $q) {
                $q->whereNull('ends_at')
                    ->orWhere('ends_at', '>', now());
            });
    }

    public function scopeScheduled(Builder $query): Builder
    {
        return $query->where('status', RoleDelegationStatus::Scheduled);
    }

    public function scopeReadyToActivate(Builder $query): Builder
    {
        return $query->where('status', RoleDelegationStatus::Scheduled)
            ->where(function (Builder $q) {
                $q->whereNull('starts_at')
                    ->orWhere('starts_at', '<=', now());
            });
    }

    public function scopeReadyToExpire(Builder $query): Builder
    {
        return $query->where('status', RoleDelegationStatus::Active)
            ->where('ends_at', '<=', now());
    }

    public function scopeForAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }

    public function markActive(): void
    {
        $this->update([
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
        ]);
    }

    public function markExpired(): void
    {
        $this->update([
            'status' => RoleDelegationStatus::Expired,
            'expired_at' => now(),
        ]);
    }

    public function markRevoked(User $by): void
    {
        $this->update([
            'status' => RoleDelegationStatus::Revoked,
            'revoked_at' => now(),
            'revoked_by' => $by->id,
        ]);
    }
}
