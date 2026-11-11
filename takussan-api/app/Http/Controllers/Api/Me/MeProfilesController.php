<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\SelectActiveProfileRequest;
use App\Http\Resources\Api\Me\ProfileResource;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Profiles\ActiveProfileResolver;
use App\Services\Profiles\DernierEspaceRetenu;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

class MeProfilesController extends Controller
{
    public function __construct(
        private readonly ActiveProfileResolver $resolver,
        private readonly DernierEspaceRetenu $dernierEspace,
    ) {}

    /**
     * `GET /api/me/profiles` — tous les profils COMMUTABLES du compte appelant,
     * c'est-à-dire ceux que `ActiveProfileResolver::TYPE_MAP` sait nommer.
     * Toujours borné à l'appelant : ce point d'entrée ne liste jamais les
     * profils de quelqu'un d'autre.
     *
     * Le préchargement suit la liste de `User::profiles()`, il ne la précède
     * pas : un profil préchargé ici sans alias dans `TYPE_MAP` ferait lever
     * `ProfileResource` sur `aliasFor()` — c'était le cas du courtier entre
     * TCK-495 et son retrait (ADR-0030).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // TCK-2620 — la ville de l'agence (`agency.city`) vient de son adresse principale : chargée ICI
        // avec l'agence, en une requête par relation, jamais une par profil.
        $user->load([
            'ownerProfiles.agency.addresses' => self::adressesPrincipalesDAbord(...),
            'agentProfiles.agency.addresses' => self::adressesPrincipalesDAbord(...),
            'agencyAdminProfiles.agency.addresses' => self::adressesPrincipalesDAbord(...),
            'serviceProviderProfile',
        ]);
        // Filter out non-Active profiles before exposing them to the client.
        // Stale/suspended profiles would otherwise clutter the switcher and
        // let the user pick a context the policy layer immediately rejects.
        $profiles = $user->profiles()->filter(fn (Model $p) => $this->isActive($p))->values();

        $active = $request->activeProfile();
        $activeId = $active !== null ? $this->resolver->compositeId($active) : null;

        return $this->json([
            'data' => ProfileResource::collection($profiles)->resolve($request),
            'meta' => [
                'active_profile_id' => $activeId,
                'count' => $profiles->count(),
            ],
        ]);
    }

    /**
     * TCK-2620 — l'adresse « principale » d'une agence est sa PREMIÈRE (aucune colonne ne la désigne,
     * `PublicAgencyController` et `AgencyDetailResource` lisent déjà `addresses->first()`) : l'ordre est
     * posé ici pour qu'elle ne dépende pas du plan de requête.
     */
    private static function adressesPrincipalesDAbord($query): void
    {
        $query->orderBy('addresses.id');
    }

    private function isActive(Model $profile): bool
    {
        return match (true) {
            $profile instanceof OwnerProfile => $profile->status === OwnerProfileStatus::Active,
            $profile instanceof AgentProfile => $profile->status === AgentProfileStatus::Active,
            $profile instanceof AgencyAdminProfile => $profile->status === AgencyAdminProfileStatus::Active,
            $profile instanceof ServiceProviderProfile => $profile->status === ServiceProviderProfileStatus::Active,
            default => true,
        };
    }

    /**
     * `PATCH /api/me/active-profile` — set the active profile for the session.
     * Persists an httpOnly cookie so subsequent requests inherit the choice
     * without re-sending the header. Returns 403 if the requested profile
     * isn't owned by the caller.
     *
     * TCK-2620 (ADR-0004, amendement du 2026-11-10) — sous `remember` (vrai par défaut), le choix est
     * aussi RETENU sur le compte (`users.metadata.last_active_profile`), qui survit à la déconnexion ;
     * `remember=false` l'efface. Sous impersonation, cette route n'est jamais atteinte
     * (`EnforceImpersonationReadOnly` refuse toute écriture) : la consultation n'écrit rien.
     */
    public function updateActive(SelectActiveProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $composite = (string) $request->input('profile_id');

        $profile = $this->resolver->resolve($composite, $user);
        if ($profile === null) {
            abort_code(403, 'profile.not_accessible');
        }

        if ($request->retenir()) {
            $this->dernierEspace->retenir($user, $profile);
        } else {
            $this->dernierEspace->oublier($user);
        }

        $cookie = Cookie::create(
            name: 'active_profile_id',
            value: $this->resolver->compositeId($profile),
            expire: now()->addDays(30)->getTimestamp(),
            path: '/',
            domain: null,
            secure: (bool) config('session.secure', false),
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        );

        if ($profile instanceof OwnerProfile
            || $profile instanceof AgentProfile
            || $profile instanceof AgencyAdminProfile) {
            $profile->loadMissing(['agency.addresses' => self::adressesPrincipalesDAbord(...)]);
        }

        return $this->json([
            'data' => (new ProfileResource($profile))->resolve($request),
        ])->withCookie($cookie);
    }
}
