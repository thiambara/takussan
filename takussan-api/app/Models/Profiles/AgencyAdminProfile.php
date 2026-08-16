<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Concerns\HasAgencyRole;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\User;
use Database\Factories\Profiles\AgencyAdminProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * TCK-271 — agency-side profile materializing the `agency_admin` role
 * for a user inside a specific agency. Pinned as the active profile by
 * the host individual onboarding wizard ({@see HostIndividualOnboardingService})
 * so the cookie-based `ResolveActiveProfile` middleware can resolve the
 * agency context unambiguously instead of falling back on the auto-bascule
 * over a sibling OwnerProfile.
 */
class AgencyAdminProfile extends AbstractModel
{
    /** @use HasFactory<AgencyAdminProfileFactory> */
    use HasAgencyRole, HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'agency_id', 'agency_role_id', 'status', 'metadata',
    ];

    protected $casts = [
        'status' => AgencyAdminProfileStatus::class,
        'metadata' => 'array',
    ];

    /**
     * spatie/laravel-query-builder hooks. Listing surfaces (super-admin
     * console — TCK-211) consume these filters + sparse fieldsets côté
     * front — voir CLAUDE.md "API — conventions frontend".
     */
    protected static array $requestFilterable = ['status', 'agency_id', 'user_id', 'agency_role_id'];

    protected static array $requestSortable = ['id', 'created_at', 'status'];

    protected static array $requestLoadable = ['user', 'agency', 'agencyRole'];

    protected static array $requestSearchFields = [];

    protected static array $queryFields = [
        'id', 'user_id', 'agency_id', 'agency_role_id', 'status', 'metadata',
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
        return $query->where('status', AgencyAdminProfileStatus::Active->value);
    }

    public function scopeWithinAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }

    /**
     * Convenience accessor for surfaces that render the admin's display
     * name (super-admin console, audit logs). Reads from the attached
     * User; returns an empty string for the (rare) detached row.
     */
    public function getDisplayNameAttribute(): string
    {
        if ($this->user !== null) {
            return trim(($this->user->first_name ?? '').' '.($this->user->last_name ?? ''));
        }

        return '';
    }
}
