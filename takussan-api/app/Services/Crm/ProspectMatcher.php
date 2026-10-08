<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-591 §5 — rapproche les prospects d'une agence et ses biens, dans les deux sens.
 *
 * **En SQL, jamais par Meilisearch** : l'index de recherche ne porte que les biens publics
 * (TCK-578), et le rapprochement doit voir le portefeuille PRIVÉ de l'agence — c'est l'outil de
 * l'agent, pas une vitrine. Les deux sens restent bornés à UNE agence : un prospect ne correspond
 * jamais au bien d'une autre agence.
 *
 * Un critère absent (null, ou liste vide) ne filtre pas. Un prospect SANS AUCUN critère ne
 * correspond à rien : il correspondrait sinon à tout le portefeuille, et le récapitulatif
 * quotidien deviendrait du bruit.
 *
 * Villes et quartiers se comparent repliés (ADR-0025), sans replier les accents. Quand les deux
 * sont donnés, les deux doivent correspondre.
 */
class ProspectMatcher
{
    /** Ce qui n'est pas (ou plus) proposable à un prospect. Même liste que `Property::scopePublic`. */
    public const UNOFFERABLE_STATUSES = [
        PropertyStatus::Draft,
        PropertyStatus::Sold,
        PropertyStatus::Rented,
        PropertyStatus::Archived,
        PropertyStatus::UnderMaintenance,
        PropertyStatus::Unavailable,
        PropertyStatus::PendingReview,
        PropertyStatus::Rejected,
    ];

    private const CRITERIA = [
        'seeking_contract_type', 'budget_min', 'budget_max', 'seeking_property_types',
        'seeking_cities', 'seeking_neighborhoods', 'min_bedrooms',
    ];

    public static function hasCriteria(Customer $customer): bool
    {
        foreach (self::CRITERIA as $column) {
            $value = $customer->getAttribute($column);
            if ($value !== null && $value !== []) {
                return true;
            }
        }

        return false;
    }

    /** @return Builder<Property> les biens de l'agence du prospect qui lui correspondent */
    public function propertiesFor(Customer $customer): Builder
    {
        $query = Property::query()
            ->where('properties.agency_id', $customer->agency_id)
            ->whereNotIn('properties.status', self::UNOFFERABLE_STATUSES);

        if ($customer->agency_id === null || ! self::hasCriteria($customer)) {
            return $query->whereRaw('1 = 0');
        }

        if ($customer->seeking_contract_type !== null) {
            $query->where('properties.contract_type', $customer->seeking_contract_type);
        }
        if ($customer->budget_min !== null) {
            $query->where('properties.price', '>=', $customer->budget_min);
        }
        if ($customer->budget_max !== null) {
            $query->where('properties.price', '<=', $customer->budget_max);
        }
        if (! empty($customer->seeking_property_types)) {
            $query->whereIn('properties.type', $customer->seeking_property_types);
        }
        if ($customer->min_bedrooms !== null && $customer->min_bedrooms > 0) {
            $query->where('properties.bedrooms', '>=', $customer->min_bedrooms);
        }

        foreach (['seeking_cities' => 'city', 'seeking_neighborhoods' => 'neighborhood'] as $criterion => $column) {
            $wanted = array_values(array_filter(array_map(
                fn ($v) => is_string($v) ? CaseInsensitive::fold(trim($v)) : null,
                (array) ($customer->getAttribute($criterion) ?? []),
            )));
            if ($wanted === []) {
                continue;
            }

            $query->whereExists(function ($sub) use ($column, $wanted) {
                $sub->selectRaw('1')
                    ->from('addresses')
                    ->whereColumn('addresses.addressable_id', 'properties.id')
                    ->where('addresses.addressable_type', Property::class)
                    ->whereIn(DB::raw(CaseInsensitive::sql("addresses.{$column}")), $wanted);
            });
        }

        return $query;
    }

    /** @return Builder<Customer> les prospects de l'agence du bien auxquels il correspond */
    public function customersFor(Property $property): Builder
    {
        $query = Customer::query()
            ->where('customers.agency_id', $property->agency_id)
            ->where('customers.status', CustomerStatus::Active)
            ->where(fn (Builder $q) => $q
                ->whereNull('customers.pipeline_stage')
                ->orWhereNotIn('customers.pipeline_stage', [CustomerPipelineStage::Converted, CustomerPipelineStage::Lost]));

        if ($property->agency_id === null || in_array($property->status, self::UNOFFERABLE_STATUSES, true)) {
            return $query->whereRaw('1 = 0');
        }

        // Au moins un critère : un prospect sans critère ne correspond à rien (cf. docblock).
        $query->where(function (Builder $q) {
            foreach (self::CRITERIA as $column) {
                in_array($column, ['seeking_property_types', 'seeking_cities', 'seeking_neighborhoods'], true)
                    ? $q->orWhereRaw("jsonb_array_length(COALESCE(customers.{$column}, '[]'::jsonb)) > 0")
                    : $q->orWhereNotNull("customers.{$column}");
            }
        });

        $value = fn ($v) => $v instanceof \BackedEnum ? $v->value : $v;

        $query->where(fn (Builder $q) => $q->whereNull('customers.seeking_contract_type')
            ->orWhere('customers.seeking_contract_type', $value($property->contract_type)));
        $query->where(fn (Builder $q) => $q->whereNull('customers.budget_min')
            ->orWhere('customers.budget_min', '<=', $property->price));
        $query->where(fn (Builder $q) => $q->whereNull('customers.budget_max')
            ->orWhere('customers.budget_max', '>=', $property->price));
        $query->where(fn (Builder $q) => $q->whereNull('customers.min_bedrooms')
            ->orWhere('customers.min_bedrooms', 0)
            ->orWhere('customers.min_bedrooms', '<=', (int) ($property->bedrooms ?? -1)));
        $this->whereListAccepts($query, 'seeking_property_types', $value($property->type), folded: false);

        $address = $property->address()->first();
        $this->whereListAccepts($query, 'seeking_cities', $address?->city);
        $this->whereListAccepts($query, 'seeking_neighborhoods', $address?->neighborhood);

        return $query;
    }

    /** Une liste vide ou absente accepte tout ; sinon elle doit contenir la valeur. */
    private function whereListAccepts(Builder $query, string $column, ?string $candidate, bool $folded = true): void
    {
        $query->where(function (Builder $q) use ($column, $candidate, $folded) {
            $q->whereRaw("jsonb_array_length(COALESCE(customers.{$column}, '[]'::jsonb)) = 0");
            if ($candidate === null || trim($candidate) === '') {
                return;
            }

            $folded
                ? $q->orWhereRaw(
                    "EXISTS (SELECT 1 FROM jsonb_array_elements_text(customers.{$column}) AS wanted(v) WHERE "
                    .CaseInsensitive::sql('wanted.v').' = ?)',
                    [CaseInsensitive::fold(trim($candidate))],
                )
                : $q->orWhereRaw("customers.{$column} @> ?::jsonb", [json_encode([$candidate])]);
        });
    }
}
