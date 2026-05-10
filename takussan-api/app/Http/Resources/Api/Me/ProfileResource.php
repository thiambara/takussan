<?php

namespace App\Http\Resources\Api\Me;

use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wire-format for a profile in the Me-namespace endpoints. The composite
 * `id` (e.g. `agent:5`) is what the client passes back via `X-Profile-Id`
 * or `PATCH /api/me/active-profile` — it disambiguates IDs across the
 * four profile tables.
 */
class ProfileResource extends JsonResource
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
            ]),
            'status' => $this->statusValue(),
            'created_at' => $this->resource->created_at?->toIso8601String(),
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
