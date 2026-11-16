<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\CustomerCommercialAttributes;
use App\Services\Crm\CustomerFollowUpQuery;
use App\Services\Crm\ProspectMatcher;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2855 — les deux gestes nominatifs de « Ma journée » de l'agent
 * (`GET /api/dashboard/me?include=suggestions`) :
 *
 *  - `follow_up` : le client à relancer qui attend depuis le plus longtemps — la relance de
 *    {@see CustomerFollowUpQuery} (filtre `follow_up=1`, tri `-follow_up_days`), rien de recopié ;
 *  - `matches` : le client qui a le plus de biens rapprochés NON ENCORE PROPOSÉS — la règle de
 *    `matching-properties` ({@see ProspectMatcher::propertiesFor()}), moins les biens qu'il a déjà
 *    visités (une visite, quel que soit son état) ou demandés (une réservation, candidature ou
 *    offre). Takussan n'enregistre aucun autre « envoi » d'un bien à un client.
 *
 * « Les clients de l'agent » : ceux dont il est le référent (relation `agent_client` principale et
 * active, le `filter[referent]=me` de la liste), dans son agence active, et qu'il peut lire
 * (`Customer::scopeVisibleTo`, la règle de `CustomerPolicy::view`).
 *
 * Coût borné : le rapprochement ne se joue que pour les {@see self::MATCH_CANDIDATES} fiches
 * rapprochables les plus récemment modifiées — un COUNT chacune —, et seulement quand l'écran demande
 * `include=suggestions`. Pas de cache : la suggestion doit disparaître dès que le bien est proposé.
 */
final class AgentDaySuggestions
{
    /** Le nombre de fiches dont le rapprochement est calculé à chaque lecture. */
    public const MATCH_CANDIDATES = 20;

    /** Le nombre de biens montrés en exemple. */
    public const SAMPLE_SIZE = 3;

    public function __construct(private readonly ProspectMatcher $matcher) {}

    /**
     * @return array{
     *     follow_up: array{customer: array{id: int, full_name: string}, waiting_days: int}|null,
     *     matches: array{customer: array{id: int, first_name: string|null}, count: int, sample: list<array{id: int, title: string|null, neighborhood: string|null}>}|null,
     * }
     */
    public function for(User $agent): array
    {
        $agencyId = $agent->staffAgencyId();
        if ($agencyId === null) {
            return ['follow_up' => null, 'matches' => null];
        }

        return [
            'follow_up' => $this->followUp($agent, $agencyId),
            'matches' => $this->matches($agent, $agencyId),
        ];
    }

    /** @return Builder<Customer> les clients de l'agent : référent, agence active, fiche lisible */
    private function clientsOf(User $agent, int $agencyId): Builder
    {
        return Customer::query()
            ->visibleTo($agent)
            ->where('customers.agency_id', $agencyId)
            ->whereHas('relationships', fn (Builder $r) => CustomerCommercialAttributes::asReferent($r)
                ->where('user_customer_relationships.user_id', $agent->id));
    }

    /** @return array{customer: array{id: int, full_name: string}, waiting_days: int}|null */
    private function followUp(User $agent, int $agencyId): ?array
    {
        $followUp = new CustomerFollowUpQuery($agent);

        $query = $this->clientsOf($agent, $agencyId);
        $followUp->filter($query, true);
        $followUp->sort($query, true);

        $customer = $query->orderBy('customers.id')->first(['customers.id', 'customers.first_name', 'customers.last_name']);
        if ($customer === null) {
            return null;
        }

        $relance = $followUp->forPage([(int) $customer->id])[(int) $customer->id] ?? null;

        return [
            'customer' => ['id' => (int) $customer->id, 'full_name' => $customer->full_name],
            'waiting_days' => (int) ($relance['days'] ?? 0),
        ];
    }

    /** @return array{customer: array{id: int, first_name: string|null}, count: int, sample: list<array{id: int, title: string|null, neighborhood: string|null}>}|null */
    private function matches(User $agent, int $agencyId): ?array
    {
        $candidates = ProspectMatcher::whereMatchable($this->clientsOf($agent, $agencyId))
            ->orderByDesc('customers.updated_at')
            ->orderByDesc('customers.id')
            ->limit(self::MATCH_CANDIDATES)
            ->get();

        $best = null;
        $bestCount = 0;
        foreach ($candidates as $customer) {
            $count = $this->notYetProposed($customer)->count();
            if ($count > $bestCount) {
                [$best, $bestCount] = [$customer, $count];
            }
        }

        if ($best === null) {
            return null;
        }

        // L'ordre de `matching-properties` : les plus récemment publiés d'abord.
        $sample = $this->notYetProposed($best)
            ->with('address:id,addressable_id,addressable_type,neighborhood')
            ->orderByDesc('properties.published_at')
            ->orderByDesc('properties.id')
            ->limit(self::SAMPLE_SIZE)
            ->get(['properties.id', 'properties.title'])
            ->map(fn (Property $p) => [
                'id' => (int) $p->id,
                'title' => $p->title,
                'neighborhood' => $p->address?->neighborhood,
            ])
            ->values()
            ->all();

        return [
            'customer' => ['id' => (int) $best->id, 'first_name' => $best->first_name],
            'count' => $bestCount,
            'sample' => $sample,
        ];
    }

    /** @return Builder<Property> les biens rapprochés du client qu'il n'a ni visités ni demandés */
    private function notYetProposed(Customer $customer): Builder
    {
        return $this->matcher->propertiesFor($customer)
            ->whereNotExists(fn ($q) => $q->selectRaw('1')
                ->from((new PropertyVisit)->getTable())
                ->where('property_visits.customer_id', $customer->id)
                ->whereColumn('property_visits.property_id', 'properties.id'))
            ->whereNotExists(fn ($q) => $q->selectRaw('1')
                ->from((new Booking)->getTable())
                ->where('bookings.customer_id', $customer->id)
                ->whereColumn('bookings.property_id', 'properties.id')
                ->whereNull('bookings.deleted_at'));
    }
}
