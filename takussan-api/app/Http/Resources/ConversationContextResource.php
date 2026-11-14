<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Messaging\ConversationThreadContext;
use Illuminate\Http\Request;

/**
 * TCK-2630 — `GET /api/conversations/{conversation}/context`, la colonne de contexte d'un fil.
 * Les décisions (qui lit quoi) sont prises par {@see ConversationThreadContext} ; ici, la forme.
 *
 * `customer` n'est PAS rendu (clé absente) à qui n'est pas du personnel de l'agence du fil : un
 * client, un bailleur ou un prestataire ne voit jamais qu'une fiche CRM existe. Pour le personnel,
 * il vaut `null` quand il n'y a pas de fiche (groupe, inconnu du CRM). `stage`, `phone` et
 * `assigned_agent` valent `null` ensemble sans `CustomerPolicy::view` (TCK-2724) ; `id` et
 * `full_name` restent au personnel.
 *
 * @property ConversationThreadContext $resource
 */
class ConversationContextResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $context = $this->resource;
        $property = $context->property;
        $lease = $context->lease;
        $maintenance = $context->maintenance;
        $customer = $context->customer;

        return [
            'property' => $property === null ? null : [
                'id' => $property->id,
                'slug' => $property->slug,
                'title' => $property->title,
                'reference_number' => $property->reference_number,
                'price' => $property->price !== null ? (float) $property->price : null,
                'status' => $this->enumValue($property->status),
                // Même photo que la vignette de la liste (`main_photo_url`), par le seul chemin des
                // URL publiques : jamais l'original, filigrane respecté.
                'cover_url' => ($media = $property->getFirstMedia('photos'))
                    ? PublicPhotoUrl::upTo($media, 'preview', fn () => $property->requiresWatermark())
                    : null,
            ],
            'lease' => $lease === null ? null : [
                'id' => $lease->id,
                'status' => $this->enumValue($lease->status),
                'reference' => $lease->reference_number,
                'tenant_name' => $lease->tenant?->full_name,
            ],
            'maintenance' => $maintenance === null ? null : [
                'id' => $maintenance->id,
                'status' => $this->enumValue($maintenance->status),
                'title' => $maintenance->title,
                'scheduled_at' => $this->iso($maintenance->scheduled_at),
            ],
            // TCK-2748 — la relation de chaque participant actuel au contexte du fil, jugée sur ce que
            // le lecteur peut lire ({@see \App\Services\Messaging\RelationsAuFil}) ; liste vide sans
            // objet lisible. Des codes : le front possède le libellé.
            'participants' => $context->participants,
            'customer' => $this->when($context->customerShown, fn () => $customer === null ? null : [
                'id' => $customer->id,
                'full_name' => $customer->full_name,
                'stage' => $context->customerReadable ? $this->enumValue($customer->pipeline_stage) : null,
                'phone' => $context->customerReadable ? $customer->phone : null,
                'assigned_agent' => ! $context->customerReadable || $context->referent === null ? null : [
                    'id' => $context->referent->id,
                    'name' => $context->referent->nameWithoutContact(),
                ],
            ]),
        ];
    }
}
