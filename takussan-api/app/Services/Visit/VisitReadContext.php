<?php

namespace App\Services\Visit;

use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2585 — ce que `PropertyVisitResource` doit savoir d'une visite et que la ligne rendue ne porte
 * pas toujours : sous `fields[property_visits]` / `fields[properties]`, ni l'agence ni le
 * propriétaire du bien, ni la fiche, ni le statut ne sont garantis. Relus ici, pour la PAGE entière,
 * en un nombre de requêtes qui ne dépend pas de sa taille :
 *
 *   · une requête : la visite, l'agence et le propriétaire de son bien, la fiche (nom, téléphone) ;
 *   · au plus deux : l'historique du visiteur sur le bien (`visits_on_property`), par fiche ou
 *     compte, à défaut par téléphone.
 *
 * Les règles qui en découlent (adresse au visiteur seulement confirmée, `visitor_display` masqué
 * comme `visitor_name`) se jugent sur ces valeurs relues : FERMÉES quand rien n'est connu.
 */
final class VisitReadContext
{
    private const ATTRIBUTE = 'tck2585.visit_context';

    /** @param  iterable<PropertyVisit>  $visits */
    public static function prime(Request $request, iterable $visits): void
    {
        $known = $request->attributes->get(self::ATTRIBUTE, []);
        $missing = [];
        foreach ($visits as $visit) {
            $id = (int) $visit->getKey();
            if ($id > 0 && ! array_key_exists($id, $known)) {
                $missing[] = $id;
            }
        }
        if ($missing === []) {
            return;
        }

        $request->attributes->set(self::ATTRIBUTE, $known + self::load(array_values(array_unique($missing))));
    }

    /**
     * @return array{agency_id: ?int, owner_id: ?int, customer_id: ?int, customer_user_id: ?int, visitor_id: ?int, status: ?string,
     *               agent_id: ?int, scheduled_at: ?string, visitor_name: ?string, visitor_phone: ?string, customer_name: ?string, customer_phone: ?string,
     *               visits_on_property: int}|null
     */
    public static function for(Request $request, PropertyVisit $visit): ?array
    {
        self::prime($request, [$visit]);

        return $request->attributes->get(self::ATTRIBUTE, [])[(int) $visit->getKey()] ?? null;
    }

    /**
     * Toutes les visites déjà relues pour cette requête (la page entière, après `prime()`), par id —
     * de quoi juger une règle pour la page plutôt que ligne par ligne (le contact de l'agent).
     *
     * @return array<int, array<string, mixed>>
     */
    public static function rows(Request $request): array
    {
        return $request->attributes->get(self::ATTRIBUTE, []);
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array<string, mixed>>
     */
    private static function load(array $ids): array
    {
        $rows = PropertyVisit::query()
            ->from('property_visits')
            ->leftJoin('properties', 'properties.id', '=', 'property_visits.property_id')
            ->leftJoin('customers', function ($join) {
                $join->on('customers.id', '=', 'property_visits.customer_id')->whereNull('customers.deleted_at');
            })
            ->whereIn('property_visits.id', $ids)
            ->toBase()
            ->get([
                'property_visits.id', 'property_visits.property_id', 'property_visits.customer_id',
                'property_visits.visitor_id', 'property_visits.status', 'property_visits.visitor_name',
                'property_visits.visitor_phone', 'property_visits.agent_id', 'property_visits.scheduled_at', 'properties.agency_id', 'properties.user_id as owner_id',
                'customers.first_name as customer_first_name', 'customers.last_name as customer_last_name',
                'customers.phone as customer_phone', 'customers.user_id as customer_user_id',
            ]);

        $history = self::history($rows);

        $out = [];
        foreach ($rows as $row) {
            $customerName = trim(($row->customer_first_name ?? '').' '.($row->customer_last_name ?? ''));
            $out[(int) $row->id] = [
                'agency_id' => $row->agency_id !== null ? (int) $row->agency_id : null,
                'owner_id' => $row->owner_id !== null ? (int) $row->owner_id : null,
                'customer_id' => $row->customer_id !== null ? (int) $row->customer_id : null,
                // Le compte de la fiche (fiche effacée : `null`, comme `$visit->customer`) — de quoi
                // dire au lecteur s'il est le demandeur (`abilities.feedback_customer`).
                'customer_user_id' => $row->customer_user_id !== null ? (int) $row->customer_user_id : null,
                'visitor_id' => $row->visitor_id !== null ? (int) $row->visitor_id : null,
                'status' => $row->status,
                // TCK-2587 (lot C) — le contact de l'agent, servi au visiteur d'une visite confirmée À
                // VENIR : l'agent et l'heure, relus comme le statut.
                'agent_id' => $row->agent_id !== null ? (int) $row->agent_id : null,
                'scheduled_at' => $row->scheduled_at !== null ? (string) $row->scheduled_at : null,
                'visitor_name' => $row->visitor_name,
                'visitor_phone' => $row->visitor_phone,
                'customer_name' => $customerName !== '' ? $customerName : null,
                'customer_phone' => $row->customer_phone,
                'visits_on_property' => $history[(int) $row->id] ?? 1,
            ];
        }

        return $out;
    }

    /**
     * Combien de visites — non annulées, celle-ci comprise — la même personne a sur le même bien :
     * 1 = « 1re visite », plus = « revient ». La personne est sa fiche OU son compte (le compte de la
     * visite, ou celui de la fiche), comme `visits_on_property` d'une réservation (TCK-2593) : la
     * demande publique faite par le compte, puis la visite planifiée sur la fiche, sont la même
     * personne. Sans fiche ni compte, son téléphone.
     *
     * Deux requêtes au plus pour la page : les visites des biens de la page qui portent l'une de ces
     * fiches ou l'un de ces comptes, comptées ici ; et un compte groupé par téléphone.
     *
     * @param  Collection<int, object>  $rows
     * @return array<int, int>
     */
    private static function history(Collection $rows): array
    {
        $persons = [];
        $byPhone = [];
        foreach ($rows as $row) {
            if ($row->property_id === null) {
                continue;
            }
            $customer = $row->customer_id !== null ? (int) $row->customer_id : null;
            $account = $row->visitor_id !== null ? (int) $row->visitor_id
                : ($row->customer_user_id !== null ? (int) $row->customer_user_id : null);
            if ($customer !== null || $account !== null) {
                $persons[(int) $row->id] = [(int) $row->property_id, $customer, $account];
            } elseif ($row->visitor_phone !== null && $row->visitor_phone !== '') {
                $byPhone[(int) $row->id] = [(int) $row->property_id, (string) $row->visitor_phone];
            }
        }

        $out = [];

        if ($persons !== []) {
            $customers = array_values(array_unique(array_filter(array_column($persons, 1), fn ($v) => $v !== null)));
            $accounts = array_values(array_unique(array_filter(array_column($persons, 2), fn ($v) => $v !== null)));
            $history = PropertyVisit::query()
                ->leftJoin('customers', function ($join) {
                    $join->on('customers.id', '=', 'property_visits.customer_id')->whereNull('customers.deleted_at');
                })
                ->whereIn('property_visits.property_id', array_values(array_unique(array_column($persons, 0))))
                ->where('property_visits.status', '!=', VisitStatus::Cancelled->value)
                ->where(fn ($q) => $q
                    ->when($customers !== [], fn ($w) => $w->orWhereIn('property_visits.customer_id', $customers))
                    ->when($accounts !== [], fn ($w) => $w
                        ->orWhereIn('property_visits.visitor_id', $accounts)
                        ->orWhereIn('customers.user_id', $accounts)))
                ->toBase()
                ->get([
                    'property_visits.id', 'property_visits.property_id', 'property_visits.customer_id',
                    'property_visits.visitor_id', 'customers.user_id as customer_user_id',
                ]);

            foreach ($persons as $visitId => [$propertyId, $customer, $account]) {
                $out[$visitId] = max(1, $history->filter(fn (object $h) => (int) $h->property_id === $propertyId && (
                    ($customer !== null && $h->customer_id !== null && (int) $h->customer_id === $customer)
                    || ($account !== null && (
                        ($h->visitor_id !== null && (int) $h->visitor_id === $account)
                        || ($h->customer_user_id !== null && (int) $h->customer_user_id === $account)
                    ))
                ))->count());
            }
        }

        if ($byPhone !== []) {
            $counts = [];
            PropertyVisit::query()
                ->whereIn('property_id', array_values(array_unique(array_column($byPhone, 0))))
                ->whereIn('visitor_phone', array_values(array_unique(array_column($byPhone, 1))))
                ->where('status', '!=', VisitStatus::Cancelled->value)
                ->groupBy('property_id', 'visitor_phone')
                ->toBase()
                ->get(['property_id', 'visitor_phone', DB::raw('count(*) as n')])
                ->each(function (object $c) use (&$counts) {
                    $counts[(int) $c->property_id][(string) $c->visitor_phone] = (int) $c->n;
                });
            foreach ($byPhone as $visitId => [$propertyId, $phone]) {
                $out[$visitId] = max(1, $counts[$propertyId][$phone] ?? 1);
            }
        }

        return $out;
    }
}
