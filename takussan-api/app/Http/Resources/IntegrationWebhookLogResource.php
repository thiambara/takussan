<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\IntegrationWebhookLog;
use Illuminate\Http\Request;

/**
 * TCK-602 (ADR-0051 §4) — une ligne du journal des webhooks, telle que la console la lit : la vue
 * EXPURGÉE (`payload`), jamais `body` ni `headers`. Chaque clé adossée à une colonne passe par
 * `whenHas()` (ADR-0021) : une colonne que `fields[]` n'a pas lue n'est pas inventée.
 *
 * @mixin IntegrationWebhookLog
 */
class IntegrationWebhookLogResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'integration_id' => $this->whenHas('integration_id'),
            'agency_id' => $this->whenHas('agency_id'),
            'channel' => $this->whenHas('channel'),
            'route_name' => $this->whenHas('route_name'),
            'provider' => $this->whenHas('provider'),
            'status' => $this->whenHas('status'),
            'event_type' => $this->whenHas('event_type'),
            'payload' => $this->whenHas('payload', fn () => $this->payload ?? []),
            'body_sha256' => $this->whenHas('body_sha256'),
            'body_truncated' => $this->whenHas('body_truncated'),
            'http_method' => $this->whenHas('http_method'),
            'authenticated_at' => $this->whenHas('authenticated_at', fn () => $this->iso($this->authenticated_at)),
            'http_status' => $this->whenHas('http_status'),
            'error_code' => $this->whenHas('error_code'),
            'error_message' => $this->whenHas('error_message'),
            'external_id' => $this->whenHas('external_id'),
            'matched_count' => $this->whenHas('matched_count'),
            'attempts' => $this->whenHas('attempts'),
            'replayed_at' => $this->whenHas('replayed_at', fn () => $this->iso($this->replayed_at)),
            'replayed_by_id' => $this->whenHas('replayed_by_id'),
            'processed_at' => $this->whenHas('processed_at', fn () => $this->iso($this->processed_at)),
            'created_at' => $this->whenHas('created_at', fn () => $this->iso($this->created_at)),
            // Lu sur la ligne entière seulement : `body` est chiffré et masqué, jamais émis.
            'replayable' => $this->when(
                array_key_exists('status', $this->resource->getAttributes()) && array_key_exists('body', $this->resource->getAttributes()),
                fn () => $this->resource->isReplayable(),
            ),
        ];
    }
}
