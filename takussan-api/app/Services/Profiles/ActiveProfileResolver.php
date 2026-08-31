<?php

namespace App\Services\Profiles;

use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Resolves the composite "<type>:<id>" profile identifier into a concrete
 * profile model. The composite form is necessary because a single numeric
 * id is ambiguous across the five profile tables (e.g. owner #5 ≠ agent #5).
 */
class ActiveProfileResolver
{
    /**
     * Map of public type aliases to concrete profile classes. The aliases
     * are stable wire identifiers — used in headers, cookies and resources.
     *
     * ⚠ **TCK-495 — cette carte est la LISTE DES PROFILS COMMUTABLES, et rien
     * d'autre.** `broker` en a été retiré le 2026-08-31
     * ({@see docs/adr/0027-le-courtier-sort-de-la-surface-commutable.md}) :
     * `BrokerProfile` et `BrokerAgencyCollaboration` restent en base, avec
     * leurs migrations, leurs factories et leurs seeders, mais l'alias n'est
     * plus proposé au choix. Un profil sélectionnable qui n'ouvre aucun écran
     * coûte plus cher que pas de profil du tout — c'était le cas du courtier :
     * zéro route API, zéro page front, aucun chemin qui crée le profil.
     *
     * **Y remettre `broker` ne suffira pas à le faire revenir**, et c'est
     * délibéré : il lui faudra d'abord une porte, des capacités déclarées dans
     * `MembershipCapabilityResolver`, et des écrans. La garde
     * `AppSidebar.audience.test.tsx` refuse tout alias de cette carte qui
     * n'ouvre rien de plus que le socle.
     */
    public const TYPE_MAP = [
        'agency_admin' => AgencyAdminProfile::class,
        'owner' => OwnerProfile::class,
        'agent' => AgentProfile::class,
        'service_provider' => ServiceProviderProfile::class,
    ];

    public function aliasFor(Model $profile): string
    {
        $class = $profile::class;
        $alias = array_search($class, self::TYPE_MAP, strict: true);
        if ($alias === false) {
            throw new \InvalidArgumentException("Unknown profile class: {$class}");
        }

        return $alias;
    }

    public function compositeId(Model $profile): string
    {
        return $this->aliasFor($profile).':'.$profile->getKey();
    }

    /**
     * Parse a composite "<type>:<id>" identifier and load the matching
     * profile if it belongs to the user. Returns null on any failure
     * (malformed, unknown type, missing row, soft-deleted, cross-user).
     */
    public function resolve(?string $composite, User $user): ?Model
    {
        if ($composite === null || $composite === '') {
            return null;
        }

        $parts = explode(':', $composite, 2);
        if (count($parts) !== 2) {
            return null;
        }

        [$alias, $rawId] = $parts;
        if (! ctype_digit($rawId)) {
            return null;
        }
        $class = self::TYPE_MAP[$alias] ?? null;
        if ($class === null) {
            return null;
        }

        $profile = $class::query()
            ->whereKey((int) $rawId)
            ->where('user_id', $user->id)
            ->first();

        if ($profile === null) {
            return null;
        }

        // Reject suspended/draft/inactive profiles. A cookie or explicit
        // header pointing to a non-Active profile must not lock the user
        // into that team_id for the request (the middleware will silently
        // skip the cookie path; the controller will return 403).
        return match (true) {
            $profile instanceof OwnerProfile => $profile->status === OwnerProfileStatus::Active ? $profile : null,
            $profile instanceof AgentProfile => $profile->status === AgentProfileStatus::Active ? $profile : null,
            $profile instanceof AgencyAdminProfile => $profile->status === AgencyAdminProfileStatus::Active ? $profile : null,
            $profile instanceof ServiceProviderProfile => $profile->status === ServiceProviderProfileStatus::Active ? $profile : null,
            // BrokerProfile has no status enum — accept as-is.
            default => $profile,
        };
    }
}
