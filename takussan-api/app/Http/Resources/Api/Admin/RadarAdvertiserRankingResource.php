<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Radar\Observatory\RadarAdvertiserRanking;
use Illuminate\Http\Request;

/**
 * TCK-2393 (ADR-0083 §5) — une ligne du classement des annonceurs. Les colonnes de l'annonceur passent par `whenHas` (sparse
 * fieldset `fields[radar_advertisers]`) ; les comptes (`listings_count`, `published_count`, `outreaches_count`) et le détail
 * ({@see RadarAdvertiserRanking::detailsFor()} : quartiers, gammes de prix, sites, piste commerciale) sont toujours rendus.
 */
class RadarAdvertiserRankingResource extends BaseResource
{
    /** @var array<string, mixed> */
    private array $details = [];

    /** @param  array<string, mixed>  $details */
    public function withDetails(array $details): static
    {
        $this->details = $details;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->whenHas('id'),
            'phone' => $this->whenHas('phone'),
            'display_name' => $this->whenHas('display_name'),
            'nature' => $this->whenHas('nature', fn () => $this->enumValue($this->nature)),
            'user_id' => $this->whenHas('user_id'),
            'do_not_contact_at' => $this->whenHas('do_not_contact_at', fn () => $this->iso($this->do_not_contact_at)),
            'listings_count' => (int) $this->resource->getAttribute('listings_count'),
            'published_count' => (int) $this->resource->getAttribute('published_count'),
            'outreaches_count' => (int) $this->resource->getAttribute('outreaches_count'),
        ] + $this->details;
    }
}
