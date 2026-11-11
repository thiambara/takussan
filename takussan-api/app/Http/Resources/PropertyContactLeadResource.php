<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Crm\ContactLeadKnownCustomers;
use Illuminate\Http\Request;

/**
 * TCK-590 — une demande de contact telle que la boîte « Demandes » la lit : entière, téléphone
 * compris. `ip` et `user_agent` n'en sortent JAMAIS (contrainte 8) : ils servent à l'anti-abus,
 * pas à l'agence.
 */
class PropertyContactLeadResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        // TCK-2582 — « déjà client » : au seul personnel de l'agence de la demande, calculé pour la
        // page entière quand la liste l'a amorcé (`ContactLeadKnownCustomers::prime`).
        $known = ContactLeadKnownCustomers::for($request, $this->resource);

        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'agency_id' => $this->agency_id,
            'recipient_user_id' => $this->recipient_user_id,
            'channel' => $this->channel?->value,
            'source' => $this->source,
            'medium' => $this->medium,
            'locale' => $this->locale,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'message' => $this->message,
            'handled_at' => $this->iso($this->handled_at),
            'handled_by_id' => $this->handled_by_id,
            'customer_id' => $this->customer_id,
            // TCK-2583 — le premier geste de contact : répondre ne vaut pas traiter (`handled_at`).
            'first_responded_at' => $this->iso($this->first_responded_at),
            'first_responded_by_id' => $this->first_responded_by_id,
            'first_response_channel' => $this->first_response_channel,
            ...($known !== ContactLeadKnownCustomers::ABSENT ? ['known_customer' => $known] : []),
            'created_at' => $this->iso($this->created_at),
            'property' => $this->whenLoaded('property', fn () => $this->property ? [
                'id' => $this->property->id,
                'title' => $this->property->title,
                'slug' => $this->property->slug,
            ] : null),
            'recipient' => $this->whenLoaded('recipient', fn () => $this->recipient ? [
                'id' => $this->recipient->id,
                'first_name' => $this->recipient->first_name,
                'last_name' => $this->recipient->last_name,
            ] : null),
        ];
    }
}
