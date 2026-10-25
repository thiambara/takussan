<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Policies\PropertyPolicy;
use Illuminate\Http\Request;

/**
 * TCK-1047 (piste P61.01) — une ligne de `/api/properties/{id}/collaborators`, telle que la rendent
 * `index`, `store`, `update` et `designatePrimary`.
 *
 * Le compte du collaborateur passe par la projection d'{@see IncludedUserResource}, plus
 * `username` : le slug public, que l'écran affiche quand le nom manque. Avant, la ligne sortait
 * brute (`->with('user')->get()`) et seul `User::$hidden` filtrait le compte : 38 clés, dont
 * `google_id`, `metadata`, `secondary_phone` et `last_login_at`, au bailleur du bien comme à tout
 * membre de l'agence.
 *
 * `commission_share` reste la chaîne du cast `decimal:2`, comme avant : le type du front la lit
 * ainsi (`property-collaborators.ts`).
 *
 * TCK-2364 (P241.01, P241.03 ; ADR-0049 amendé le 2026-10-25) — la part n'est rendue qu'à qui la
 * fixe ({@see PropertyPolicy::manageCommissionShares()}) : le bailleur du bien ne la lit plus. Hors
 * de ce lecteur, la clé manque, plutôt que de valoir `null`, qui dirait « aucune part ».
 */
class PropertyCollaboratorResource extends BaseResource
{
    private const MEMO_PARTS = 'tck2364.parts_lisibles';

    public function toArray(Request $request): array
    {
        /** @var PropertyCollaborator $ligne */
        $ligne = $this->resource;

        return [
            'id' => $ligne->id,
            'property_id' => $ligne->property_id,
            'user_id' => $ligne->user_id,
            'role' => $this->enumValue($ligne->role),
            'is_primary' => (bool) $ligne->is_primary,
            'commission_share' => $this->when(
                $ligne->property !== null && self::partsLisibles($request, $ligne->property),
                fn () => $ligne->commission_share,
            ),
            'invited_at' => $this->iso($ligne->invited_at),
            'accepted_at' => $this->iso($ligne->accepted_at),
            'created_at' => $this->iso($ligne->created_at),
            'updated_at' => $this->iso($ligne->updated_at),
            'user' => $this->when($ligne->relationLoaded('user'), fn () => $this->compte($ligne->user)),
        ];
    }

    /**
     * La règle d'écriture vaut pour la lecture, et ne dépend que de l'agence du bien : jugée une fois
     * par agence et par requête, pour une liste de biens comme pour une liste de lignes.
     */
    public static function partsLisibles(Request $request, Property $property): bool
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return false;
        }

        /** @var array<int, bool> $memo */
        $memo = $request->attributes->get(self::MEMO_PARTS, []);
        $agence = (int) $property->agency_id;
        if (! array_key_exists($agence, $memo)) {
            $memo[$agence] = $user->can('manageCommissionShares', $property);
            $request->attributes->set(self::MEMO_PARTS, $memo);
        }

        return $memo[$agence];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function compte(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        return (new IncludedUserResource($user))->resolve() + ['username' => $user->username];
    }
}
