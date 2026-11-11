<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * TCK-2588 — les attributs CALCULÉS d'une fiche client, demandés par `fields[customers]` :
 * `next_action` ({@see CustomerNextActionQuery}), `follow_up` ({@see CustomerFollowUpQuery}) et
 * `referent` (la relation `agent_client` principale et active — la même que lisent le portefeuille
 * d'un agent et le récapitulatif des prospects).
 *
 * Ce ne sont pas des colonnes : `Customer::buildQuery()` les retire de `fields[customers]` avant
 * spatie (qui les sélectionnerait, `customers.next_action` n'existe pas) et les note sur la
 * requête ; le contrôleur les calcule pour la page entière, en un nombre de requêtes qui ne dépend
 * pas de sa taille ; `CustomerResource` les rend. Non demandés, ils ne sont ni calculés ni rendus.
 */
final class CustomerCommercialAttributes
{
    // TCK-2591 — `suggested_stage` ({@see CustomerSuggestedStageQuery}).
    public const FIELDS = ['next_action', 'follow_up', 'referent', 'suggested_stage'];

    private const REQUESTED = 'tck2588.commercial.requested';

    private const VALUES = 'tck2588.commercial.values';

    /**
     * La requête que spatie doit lire : `fields[customers]` sans les attributs calculés. Ceux
     * demandés sont notés sur `$request` ({@see self::requested()}).
     */
    public static function strip(Request $request): Request
    {
        $fields = $request->query('fields');
        if (! is_array($fields) || ! array_key_exists('customers', $fields)) {
            return $request;
        }

        $raw = $fields['customers'];
        $names = is_array($raw) ? $raw : explode(',', (string) $raw);
        $names = array_values(array_filter(array_map(fn ($n) => is_string($n) ? trim($n) : '', $names), fn ($n) => $n !== ''));

        $virtual = array_values(array_intersect($names, self::FIELDS));
        if ($virtual === []) {
            return $request;
        }

        $request->attributes->set(self::REQUESTED, $virtual);

        $rest = array_values(array_diff($names, self::FIELDS));
        if ($rest === []) {
            unset($fields['customers']);
        } else {
            $fields['customers'] = implode(',', $rest);
        }

        $query = $request->query->all();
        if ($fields === []) {
            unset($query['fields']);
        } else {
            $query['fields'] = $fields;
        }

        return $request->duplicate($query);
    }

    /** @return list<string> */
    public static function requested(Request $request): array
    {
        $requested = $request->attributes->get(self::REQUESTED, []);

        return is_array($requested) ? $requested : [];
    }

    /**
     * Calcule, pour les fiches de la page, les attributs demandés, et les pose sur la requête.
     *
     * @param  list<int>  $ids
     */
    public static function attach(Request $request, User $viewer, array $ids): void
    {
        $requested = self::requested($request);
        if ($requested === [] || $ids === []) {
            return;
        }

        $values = [];
        if (in_array('next_action', $requested, true)) {
            $values['next_action'] = (new CustomerNextActionQuery($viewer))->forPage($ids);
        }
        if (in_array('follow_up', $requested, true)) {
            $values['follow_up'] = (new CustomerFollowUpQuery($viewer))->forPage($ids);
        }
        if (in_array('referent', $requested, true)) {
            $values['referent'] = self::referents($ids);
        }
        if (in_array('suggested_stage', $requested, true)) {
            // Vérification adverse de TCK-2591 — l'étape proposée est un outil de pilotage de
            // l'agence : ses faits (compte rendu « intéressé », visite, candidature, bail sur le bien
            // d'un AUTRE bailleur) ne sortent qu'au personnel de l'agence de la fiche et au
            // super-admin. Tout autre lecteur (le bailleur auteur de la fiche) reçoit `null`.
            $staffIds = self::staffReadable($viewer, $ids);
            $values['suggested_stage'] = $staffIds === []
                ? []
                : (new CustomerSuggestedStageQuery)->forPage($staffIds);
        }

        $request->attributes->set(self::VALUES, $values);
    }

    /**
     * Les fiches de `$ids` dont `$viewer` est du personnel de l'agence (ou toutes, au super-admin) :
     * la règle de {@see Customer::criteriaBelongTo()}, jugée en une requête pour la page.
     *
     * @param  list<int>  $ids
     * @return list<int>
     */
    public static function staffReadable(User $viewer, array $ids): array
    {
        if ($viewer->isSuperAdmin()) {
            return $ids;
        }
        $staffAgencyIds = app(MembershipCapabilityResolver::class)->staffAgencyIds($viewer);
        if ($staffAgencyIds === []) {
            return [];
        }

        return Customer::query()->whereKey($ids)->whereIn('agency_id', $staffAgencyIds)
            ->pluck('id')->map(fn ($id) => (int) $id)->values()->all();
    }

    /**
     * Les attributs calculés d'UNE fiche, à étaler dans sa ressource : rien s'ils n'ont pas été
     * demandés ; `null` pour une fiche qui n'en a pas.
     *
     * @return array<string, mixed>
     */
    public static function of(Request $request, int $customerId): array
    {
        $values = $request->attributes->get(self::VALUES);
        if (! is_array($values)) {
            return [];
        }

        $out = [];
        foreach (self::requested($request) as $field) {
            $out[$field] = $values[$field][$customerId] ?? null;
        }

        return $out;
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array{id: int, name: string}>
     */
    public static function referents(array $ids): array
    {
        $out = [];
        self::referentRelations()
            ->whereIn('customer_id', $ids)
            ->with('user:id,first_name,last_name')
            ->orderBy('id')
            ->get(['id', 'customer_id', 'user_id'])
            ->each(function (UserCustomerRelationship $r) use (&$out): void {
                if ($r->user !== null && ! isset($out[(int) $r->customer_id])) {
                    $out[(int) $r->customer_id] = ['id' => (int) $r->user->id, 'name' => $r->user->getFullNameAttribute()];
                }
            });

        return $out;
    }

    /**
     * La relation qui fait un référent : `agent_client`, principale, active. `filter[referent]` et
     * l'attribut `referent` la lisent tous deux.
     *
     * @return Builder<UserCustomerRelationship>
     */
    public static function referentRelations(): Builder
    {
        return self::asReferent(UserCustomerRelationship::query());
    }

    /**
     * Les contraintes d'une relation de référent, sur un constructeur de `user_customer_relationships`
     * (requête directe ou `whereHas('relationships')`).
     *
     * @template TBuilder of Builder
     *
     * @param  TBuilder  $query
     * @return TBuilder
     */
    public static function asReferent(Builder $query): Builder
    {
        return $query
            ->where('user_customer_relationships.relationship_type', RelationshipType::AgentClient->value)
            ->where('user_customer_relationships.is_primary', true)
            ->where('user_customer_relationships.status', RelationshipStatus::Active->value);
    }
}
