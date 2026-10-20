<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\PropertyCollaborator;
use App\Models\User;
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
 */
class PropertyCollaboratorResource extends BaseResource
{
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
            'commission_share' => $ligne->commission_share,
            'invited_at' => $this->iso($ligne->invited_at),
            'accepted_at' => $this->iso($ligne->accepted_at),
            'created_at' => $this->iso($ligne->created_at),
            'updated_at' => $this->iso($ligne->updated_at),
            'user' => $this->when($ligne->relationLoaded('user'), fn () => $this->compte($ligne->user)),
        ];
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
