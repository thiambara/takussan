<?php

namespace App\Models\Concerns;

use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Identity-side profiles trait. Lives on User. Sister trait of HasRoles
 * (spatie) — HasRoles describes WHAT a user can do; HasProfiles describes
 * WHO a user is in each agency context.
 */
trait HasProfiles
{
    public function ownerProfiles(): HasMany
    {
        return $this->hasMany(OwnerProfile::class);
    }

    public function agentProfiles(): HasMany
    {
        return $this->hasMany(AgentProfile::class);
    }

    /**
     * TCK-271 — agency-admin profiles held by this user. Multi-row because
     * a future flow could attach the same user as admin to several
     * agencies (cooptation, multi-tenant operator). The wizard creates
     * exactly one row today.
     */
    public function agencyAdminProfiles(): HasMany
    {
        return $this->hasMany(AgencyAdminProfile::class);
    }

    public function brokerProfile(): HasOne
    {
        return $this->hasOne(BrokerProfile::class);
    }

    public function serviceProviderProfile(): HasOne
    {
        return $this->hasOne(ServiceProviderProfile::class);
    }

    /**
     * Unified collection of every profile this user holds, across all four
     * concrete profile classes. Not a real Eloquent relation — eager load
     * via `$user->load(['ownerProfiles', 'agentProfiles', 'brokerProfile',
     * 'serviceProviderProfile'])` upstream if needed.
     */
    public function profiles(): Collection
    {
        $owners = $this->relationLoaded('ownerProfiles')
            ? $this->ownerProfiles
            : $this->ownerProfiles()->get();
        $agents = $this->relationLoaded('agentProfiles')
            ? $this->agentProfiles
            : $this->agentProfiles()->get();
        $admins = $this->relationLoaded('agencyAdminProfiles')
            ? $this->agencyAdminProfiles
            : $this->agencyAdminProfiles()->get();
        $broker = $this->relationLoaded('brokerProfile')
            ? $this->brokerProfile
            : $this->brokerProfile()->first();
        $sp = $this->relationLoaded('serviceProviderProfile')
            ? $this->serviceProviderProfile
            : $this->serviceProviderProfile()->first();

        // `concat()` (vs `merge()`) is required: an Eloquent Collection
        // keyed by primary key would otherwise drop sibling profiles that
        // share an id across different concrete classes.
        $collection = new Collection;
        $collection = $collection->concat($owners)->concat($agents)->concat($admins);
        if ($broker) {
            $collection->push($broker);
        }
        if ($sp) {
            $collection->push($sp);
        }

        return $collection;
    }

    /**
     * Whether the user holds a profile of the given concrete class. When
     * `$agencyId` is given, restrict the check to that agency for profile
     * classes that are agency-scoped (Owner, Agent). Broker/ServiceProvider
     * are user-scoped and ignore `$agencyId`.
     */
    public function hasProfile(string $class, ?int $agencyId = null): bool
    {
        return match ($class) {
            OwnerProfile::class => $agencyId === null
                ? $this->ownerProfiles()->exists()
                : $this->ownerProfiles()->where('agency_id', $agencyId)->exists(),
            AgentProfile::class => $agencyId === null
                ? $this->agentProfiles()->exists()
                : $this->agentProfiles()->where('agency_id', $agencyId)->exists(),
            AgencyAdminProfile::class => $agencyId === null
                ? $this->agencyAdminProfiles()->exists()
                : $this->agencyAdminProfiles()->where('agency_id', $agencyId)->exists(),
            BrokerProfile::class => $this->brokerProfile()->exists(),
            ServiceProviderProfile::class => $this->serviceProviderProfile()->exists(),
            default => false,
        };
    }

    public function isOwnerAt(int $agencyId): bool
    {
        return $this->ownerProfiles()
            ->where('agency_id', $agencyId)
            ->whereNull('deleted_at')
            ->exists();
    }

    public function isAgentAt(int $agencyId): bool
    {
        return $this->agentProfiles()
            ->where('agency_id', $agencyId)
            ->whereNull('deleted_at')
            ->exists();
    }

    public function isProviderAt(int $agencyId): bool
    {
        return $this->serviceProviderProfile()
            ->whereHas('agencyCollaborations', fn ($q) => $q->where('agency_id', $agencyId))
            ->exists();
    }

    public function isProfessional(): bool
    {
        return $this->agentProfiles()->exists()
            || $this->brokerProfile()->exists()
            || $this->serviceProviderProfile()->exists();
    }

    /**
     * Active profile for the current request — set by `ResolveActiveProfile`
     * middleware. Reads through `request()->activeProfile()` so the truth
     * lives in one place. Returns null outside the request scope, when no
     * profile was resolved, or when the current request actor is a *different*
     * user than `$this` (the active profile is per-request, not a property
     * of arbitrary User instances).
     */
    public function activeProfile()
    {
        if (! app()->bound('request')) {
            return null;
        }

        $profile = request()->activeProfile();
        if ($profile === null) {
            return null;
        }

        return ((int) $profile->user_id === (int) $this->id) ? $profile : null;
    }
}
