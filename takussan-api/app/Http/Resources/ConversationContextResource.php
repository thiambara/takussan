<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Customer;
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
                // TCK-2858 — le projet, la dernière visite, le premier contact et la demande liée, sous la
                // même règle que `stage` et `phone` : `null` sans `CustomerPolicy::view`.
                'project' => $context->customerReadable ? $this->project($customer) : null,
                'last_visit' => $context->lastVisit === null ? null : [
                    'id' => $context->lastVisit->id,
                    'scheduled_at' => $this->iso($context->lastVisit->scheduled_at),
                    'property_title' => $context->lastVisit->property?->title,
                ],
                'first_contact_at' => $context->customerReadable ? $this->iso($context->firstContactAt) : null,
                'origin' => $context->customerReadable ? $context->origin : null,
                'contact_lead' => $context->contactLead === null ? null : [
                    'id' => $context->contactLead->id,
                    'created_at' => $this->iso($context->contactLead->created_at),
                    'property_title' => $context->contactLead->property?->title,
                ],
            ]),
        ];
    }

    /**
     * TCK-2858 — le besoin du client tel que la fiche CRM le porte (critères de TCK-591) ; `null`
     * quand aucun critère n'est saisi. Les budgets en nombre, comme `property.price`.
     *
     * @return array<string, mixed>|null
     */
    private function project(Customer $customer): ?array
    {
        $project = [
            'contract_type' => $customer->seeking_contract_type,
            'property_types' => $customer->seeking_property_types ?: [],
            'budget_min' => $customer->budget_min !== null ? (float) $customer->budget_min : null,
            'budget_max' => $customer->budget_max !== null ? (float) $customer->budget_max : null,
            'cities' => $customer->seeking_cities ?: [],
            'neighborhoods' => $customer->seeking_neighborhoods ?: [],
        ];

        return array_filter($project, fn ($v) => $v !== null && $v !== []) === [] ? null : $project;
    }
}
