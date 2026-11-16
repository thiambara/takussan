<?php

namespace App\Services\Onboarding;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;

/**
 * TCK-2942 — le premier prospect de l'agent, lu par l'assistant de démarrage
 * (`GET /api/me/agent-profiles/{id}/first-lead`) ET rendu par `complete()`
 * (`AgentOnboardingService`) : une seule recherche, une seule projection, pour que le type front
 * `AgentFirstLeadEntry` vaille pour les deux réponses.
 *
 * La recherche reste l'heuristique de TCK-259 (`customers.added_by_id` = l'agent, bornée à son
 * agence) : le schéma n'a pas de colonne d'assignation.
 *
 * La projection porte, en plus de l'identité, ce que l'agent doit savoir avant d'appeler :
 *  - `need` : les critères de recherche de la fiche (`Customer::CRITERES_DE_RECHERCHE` hors budget),
 *    `null` quand aucun n'est posé ;
 *  - `budget_min` / `budget_max` : tels que `CustomerResource` les rend (cast `decimal:2`) ;
 *  - `last_contacted_at` (instant ISO, `BaseResource::instantOnWire`) et `last_contact_channel` ;
 *  - `origin` : la demande de contact d'où vient la fiche et son bien, sinon le bien d'intérêt,
 *    sinon `null` ;
 *  - `agency_note` : la note libre de la fiche (voir {@see self::agencyNote()}).
 */
class AgentFirstLead
{
    /** Les colonnes que la projection lit : une colonne oubliée ici rendrait son champ à `null` sans bruit. */
    private const COLONNES = [
        'id', 'first_name', 'last_name', 'email', 'phone', 'pipeline_stage', 'agency_id',
        'seeking_contract_type', 'budget_min', 'budget_max',
        'seeking_property_types', 'seeking_cities', 'seeking_neighborhoods', 'min_bedrooms',
        'last_contacted_at', 'last_contact_channel',
        'source_contact_lead_id', 'interested_property_id',
    ];

    public function find(AgentProfile $agent): ?Customer
    {
        if ($agent->user_id === null) {
            return null;
        }

        return Customer::query()
            ->where('added_by_id', $agent->user_id)
            ->when($agent->agency_id !== null, fn ($q) => $q->where('agency_id', $agent->agency_id))
            ->orderBy('id')
            ->first(self::COLONNES);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function for(AgentProfile $agent): ?array
    {
        $customer = $this->find($agent);

        return $customer === null ? null : $this->project($customer);
    }

    /**
     * @return array<string, mixed>
     */
    public function project(Customer $customer): array
    {
        return [
            'id' => $customer->id,
            'first_name' => $customer->first_name,
            'last_name' => $customer->last_name,
            'full_name' => trim((string) $customer->first_name.' '.(string) $customer->last_name),
            'email' => $customer->email,
            'phone' => $customer->phone,
            'pipeline_stage' => $customer->pipeline_stage?->value,
            'need' => $this->need($customer),
            'budget_min' => $customer->budget_min,
            'budget_max' => $customer->budget_max,
            'last_contacted_at' => BaseResource::instantOnWire($customer->last_contacted_at),
            'last_contact_channel' => $customer->last_contact_channel?->value,
            'origin' => $this->origin($customer),
            'agency_note' => $this->agencyNote($customer),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function need(Customer $customer): ?array
    {
        $need = [
            'contract_type' => $customer->seeking_contract_type ?: null,
            'property_types' => array_values((array) ($customer->seeking_property_types ?? [])),
            'cities' => array_values((array) ($customer->seeking_cities ?? [])),
            'neighborhoods' => array_values((array) ($customer->seeking_neighborhoods ?? [])),
            'min_bedrooms' => $customer->min_bedrooms,
        ];

        $vide = $need['contract_type'] === null && $need['property_types'] === [] && $need['cities'] === []
            && $need['neighborhoods'] === [] && $need['min_bedrooms'] === null;

        return $vide ? null : $need;
    }

    /**
     * La demande d'origine (et son bien) prime ; à défaut, le bien qui a fait venir la personne.
     * Un bien supprimé depuis garde son titre : c'est l'histoire du prospect, pas une annonce.
     *
     * @return array<string, mixed>|null
     */
    private function origin(Customer $customer): ?array
    {
        if ($customer->source_contact_lead_id !== null) {
            $lead = PropertyContactLead::query()
                ->whereKey($customer->source_contact_lead_id)
                ->first(['id', 'property_id', 'channel', 'created_at']);
            if ($lead !== null) {
                return [
                    'kind' => 'contact_lead',
                    'channel' => $lead->channel?->value,
                    'received_at' => BaseResource::instantOnWire($lead->created_at),
                    ...$this->property($lead->property_id),
                ];
            }
        }

        if ($customer->interested_property_id !== null) {
            return [
                'kind' => 'interested_property',
                'channel' => null,
                'received_at' => null,
                ...$this->property($customer->interested_property_id),
            ];
        }

        return null;
    }

    /**
     * @return array{property_id: int|null, property_title: string|null, property_reference: string|null}
     */
    private function property(?int $propertyId): array
    {
        $property = $propertyId === null ? null : Property::withTrashed()
            ->whereKey($propertyId)
            ->first(['id', 'title', 'reference_number']);

        return [
            'property_id' => $property?->id,
            'property_title' => $property?->title,
            'property_reference' => $property?->reference_number,
        ];
    }

    /**
     * La note de l'agence : la dernière note LIBRE de la fiche (`kind` nul), épinglée d'abord.
     *
     * - `customer_notes` n'a aucune notion de note privée : la seule règle de lecture est
     *   `CustomerNoteKind::staffOnlyValues()` (comptes rendus de visite, message d'origine d'une
     *   demande), réservées au personnel de l'agence. Le profil est encore `draft` pendant
     *   l'assistant : il n'est pas encore du personnel, ces natures ne sont donc JAMAIS rendues ici,
     *   pas plus que les notes de changement d'étape (`conversion`, `loss`), qui ne sont pas une
     *   consigne pour l'agent.
     * - À défaut de note libre, la colonne texte `customers.notes` (champ réservé au personnel,
     *   écrit par l'agence sur la fiche), sans auteur.
     *
     * @return array{body: string, author_name: string|null, created_at: string|null}|null
     */
    private function agencyNote(Customer $customer): ?array
    {
        $note = CustomerNote::query()
            ->where('customer_id', $customer->id)
            ->whereNull('kind')
            ->orderByDesc('pinned')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first(['id', 'author_id', 'body', 'pinned', 'created_at']);

        if ($note !== null && trim((string) $note->body) !== '') {
            $author = $note->author_id === null ? null : User::query()->whereKey($note->author_id)->first(['id', 'first_name', 'last_name']);
            $name = $author === null ? '' : trim((string) $author->first_name.' '.(string) $author->last_name);

            return [
                'body' => (string) $note->body,
                'author_name' => $name === '' ? null : $name,
                'created_at' => BaseResource::instantOnWire($note->created_at),
            ];
        }

        $colonne = trim((string) Customer::query()->whereKey($customer->id)->value('notes'));

        return $colonne === '' ? null : ['body' => $colonne, 'author_name' => null, 'created_at' => null];
    }
}
