<?php

namespace App\Http\Resources\Api\Me;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Http\Request;

/**
 * Wire-format for a profile in the Me-namespace endpoints. The composite
 * `id` (e.g. `agent:5`) is what the client passes back via `X-Profile-Id`
 * or `PATCH /api/me/active-profile` — it disambiguates IDs across the
 * five profile tables.
 */
class ProfileResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $resolver = app(ActiveProfileResolver::class);
        $alias = $resolver->aliasFor($this->resource);

        return [
            'id' => $resolver->compositeId($this->resource),
            'type' => $alias,
            'numeric_id' => $this->resource->getKey(),
            'agency_id' => $this->resource->agency_id ?? null,
            'agency' => $this->whenLoaded('agency', fn () => [
                'id' => $this->resource->agency->id,
                'name' => $this->resource->agency->name,
                'slug' => $this->resource->agency->slug,
                // TCK-497 — la NATURE de l'agence, et c'est une information de
                // contrat, pas de confort. L'assistant hôte crée dans une seule
                // transaction une agence `individual`, un `AgencyAdminProfile`
                // et un `OwnerProfile` : `GET /api/me/profiles` rend donc deux
                // profils que `agency.name` et `agency.slug` ne peuvent PAS
                // distinguer — ils pointent la même agence, les deux lignes du
                // sélecteur sont identiques au caractère près.
                //
                // Sans ce champ, le front n'avait qu'un recours : deviner qu'une
                // agence est personnelle à partir de son NOM (« Espace de … »).
                // Une heuristique de nom se casse au premier renommage, et à la
                // première agence professionnelle qui s'appelle comme son
                // fondateur. La nature se lit dans le modèle.
                'kind' => $this->resource->agency->kind?->value,
            ]),
            'status' => $this->statusValue(),
            'created_at' => $this->iso($this->resource->created_at),
        ];
    }

    private function statusValue(): ?string
    {
        return match (true) {
            $this->resource instanceof OwnerProfile,
            $this->resource instanceof AgentProfile,
            $this->resource instanceof AgencyAdminProfile => $this->resource->status?->value,
            $this->resource instanceof BrokerProfile,
            $this->resource instanceof ServiceProviderProfile => null,
            default => null,
        };
    }
}
