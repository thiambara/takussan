<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\InvitationStatus;
use Database\Factories\InvitationFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * TCK-249 — Pattern d'invitation unifié partagé par tous les parcours
 * d'onboarding par invitation.
 *
 * Un Invitation porte :
 *  - un token URL-safe unique signé (généré par {@see InvitationService})
 *  - un destinataire (`email`, `invited_user_id` éventuellement résolu)
 *  - un profil cible polymorphe (`invitable_*`) pré-créé en `draft`
 *  - un rôle spatie à assigner à l'acceptation, scopé sur `agency_id`
 *  - un état (`InvitationStatus`) et une expiration glissante (defaut +7j)
 *
 * Toute la logique métier (envoi, acceptation, expiration, rappel, révocation)
 * vit dans {@see \App\Services\Invitation\InvitationService} — ce modèle
 * reste un simple porteur de données + scopes de lookup.
 */
class Invitation extends AbstractModel
{
    /** @use HasFactory<InvitationFactory> */
    use HasFactory, LogsActivity;

    protected $fillable = [
        'token',
        'email',
        'invited_user_id',
        'invited_by',
        'invitable_type',
        'invitable_id',
        'agency_id',
        'role',
        'status',
        'expires_at',
        'accepted_at',
        'revoked_at',
        'last_reminded_at',
        'metadata',
    ];

    protected $casts = [
        'status' => InvitationStatus::class,
        'expires_at' => 'datetime',
        'accepted_at' => 'datetime',
        'revoked_at' => 'datetime',
        'last_reminded_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected $hidden = [
        // The token is the bearer credential for the public accept endpoint
        // — it must never leak through generic resource responses. Callers
        // that legitimately need it (the email mailable, the listing for
        // the inviter's own invitations) reach for it explicitly.
        'token',
    ];

    /**
     * Normalise email writes (lowercase + trim) so dedup / lookup is
     * case-insensitive end-to-end. Mirrors the User model contract so the
     * `(invited_user_id ↔ invitations.email)` link is always exact.
     */
    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value !== null
            ? strtolower(trim($value))
            : null;
    }

    protected static array $requestFilterable = ['status', 'agency_id', 'role', 'email', 'invited_by'];

    protected static array $requestSortable = ['id', 'created_at', 'expires_at', 'status'];

    protected static array $requestLoadable = ['inviter', 'invitedUser', 'agency', 'invitable'];

    protected static array $requestSearchFields = ['email'];

    protected static array $queryFields = [
        'id', 'email', 'invited_user_id', 'invited_by',
        'invitable_type', 'invitable_id', 'agency_id', 'role',
        'status', 'expires_at', 'accepted_at', 'revoked_at',
        'last_reminded_at', 'created_at', 'updated_at',
    ];

    /**
     * Pending = not yet accepted, revoked or expired *and* still within the
     * `expires_at` window. Used by dedup checks and by the reminder cron.
     */
    public function scopePending(Builder $query): Builder
    {
        return $query
            ->where('status', InvitationStatus::Sent->value)
            ->where('expires_at', '>', now());
    }

    /**
     * Stale `sent` invitations whose `expires_at` is in the past. Driven
     * by the `invitations:expire` cron.
     */
    public function scopeExpired(Builder $query): Builder
    {
        return $query
            ->where('status', InvitationStatus::Sent->value)
            ->where('expires_at', '<=', now());
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function invitedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_user_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /**
     * Polymorphic profile target (OwnerProfile / AgentProfile /
     * ServiceProviderProfile / ...). Nullable: super-admin cooptation
     * has no agency-scoped profile to attach to.
     */
    public function invitable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * Activity log: limited to the lifecycle-significant fields. The
     * actual event labels (`invitation_sent`, `_accepted`, `_revoked`,
     * `_expired`) are written explicitly by the service so each transition
     * lands as a distinct, queryable activity row (vs a single "updated"
     * blob).
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['status', 'expires_at', 'accepted_at', 'revoked_at', 'last_reminded_at'])
            ->logOnlyDirty()
            ->dontLogIfAttributesChangedOnly(['updated_at'])
            ->dontLogEmptyChanges();
    }
}
