<?php

namespace App\Http\Resources\Api\Me;

use App\Http\Resources\Bases\BaseResource;
use App\Models\GeoNeighborhood;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Profiles\ActiveProfileResolver;
use App\Services\Public\AgentPublic;
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

        $data = [
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
                // TCK-2620 — la VILLE, pour reconnaître un espace à son agence, son rôle et sa ville
                // (le slug n'est pas une information pour la personne). Celle de l'adresse principale
                // (la première, ordonnée par le chargeur), `null` sans adresse. Émise seulement si les
                // adresses ont été chargées : sans elles, la clé est absente — jamais un `null` qui
                // affirmerait « pas d'adresse » sur une agence dont on n'a rien lu.
                ...($this->resource->agency->relationLoaded('addresses') ? [
                    'city' => $this->resource->agency->addresses->first()?->city,
                ] : []),
            ]),
            'status' => $this->statusValue(),
            'created_at' => $this->iso($this->resource->created_at),
        ];

        // TCK-1317 (P117.04) — ce que la section « Profil professionnel » affiche en lecture
        // seule. Le seul profil d'agent les porte : les autres types n'ont pas ces colonnes.
        if ($this->resource instanceof AgentProfile) {
            $data['license_number'] = $this->resource->license_number;
            $data['specialty'] = $this->resource->specialty;
            // TCK-2524 — ce que l'agent a dit à l'annuaire (TCK-2518), relu par l'écran de profil qui
            // l'écrit (`PATCH …/directory`) : sans cette lecture, il s'ouvrait vide et un enregistrement
            // effaçait ce qui était posé. Les quartiers sont nommés (donnée du référentiel) dans l'ordre
            // choisi ; un quartier disparu n'est émis ni nommé ni en id — renvoyé, `exists` le refuserait.
            $quartiers = $this->quartiersNommes((array) ($this->resource->neighborhood_ids ?? []));
            $data['languages'] = array_values((array) ($this->resource->languages ?? []));
            $data['neighborhood_ids'] = array_column($quartiers, 'id');
            $data['neighborhoods'] = $quartiers;
            // TCK-2524 (revue) — le segment de SA fiche publique (`/agents/{slug}`), pour la puce « Voir ma
            // fiche publique » de son écran de profil. Émis pour le seul profil de l'appelant, et seulement si
            // la fiche existe : jugé par la résolution même de la page (`AgentPublic::parSlug`), qui rend
            // `null` à un compte inactif, à un agent d'agence hors ligne ou à qui n'a pas de fiche. Un lien
            // émis ici ne mène donc jamais à un 404.
            $data['public_slug'] = $this->slugDeSaFiche($request);
        }

        return $data;
    }

    private function slugDeSaFiche(Request $request): ?string
    {
        $appelant = $request->user();
        if ($appelant === null || (int) $appelant->getKey() !== (int) $this->resource->user_id) {
            return null;
        }

        // TCK-2620 — la fiche est celle de l'APPELANT, pas du profil : la même pour chacun de ses
        // profils d'agent. Calculée une fois par requête (cinq lectures par `AgentPublic::parSlug`) ;
        // sans cela `GET /api/me/profiles` en coûtait cinq par agence d'un agent de plusieurs agences.
        $cle = 'me.profiles.public_slug.'.$appelant->getKey();
        if (! $request->attributes->has($cle)) {
            $request->attributes->set($cle, $this->calculerSlugDeSaFiche($appelant));
        }

        return $request->attributes->get($cle);
    }

    private function calculerSlugDeSaFiche(User $appelant): ?string
    {
        $slug = $appelant->slugDeFiche();
        if (! is_string($slug) || $slug === '') {
            return null;
        }

        return app(AgentPublic::class)->parSlug($slug)?->is($appelant) === true ? $slug : null;
    }

    /**
     * @param  array<int, mixed>  $ids
     * @return list<array{id: int, name: string}>
     */
    private function quartiersNommes(array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if ($ids === []) {
            return [];
        }

        $noms = GeoNeighborhood::query()->whereKey($ids)->pluck('name', 'id');

        return array_values(array_map(
            fn (int $id) => ['id' => $id, 'name' => (string) $noms[$id]],
            array_filter($ids, fn (int $id) => $noms->has($id)),
        ));
    }

    private function statusValue(): ?string
    {
        return match (true) {
            $this->resource instanceof OwnerProfile,
            $this->resource instanceof AgentProfile,
            $this->resource instanceof AgencyAdminProfile => $this->resource->status?->value,
            $this->resource instanceof ServiceProviderProfile => null,
            default => null,
        };
    }
}
