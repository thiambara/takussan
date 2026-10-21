<?php

namespace App\Services\Crm;

use App\Models\Address;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Services\Search\QuartierDuFiltre;
use App\Services\Search\VilleDuFiltre;
use App\Support\Search\CleDeQuartier;
use Illuminate\Database\Eloquent\Builder;

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
 * Les villes se comparent par leur clé {@see CleDeQuartier}, accents compris : la saisie du
 * prospect est libre, et « Guediawaye » désigne « Guédiawaye » (TCK-1167, P99.05, comme les
 * quartiers depuis TCK-1083). Les quartiers suivent la
 * règle du filtre `location` de la recherche publique ({@see QuartierDuFiltre}, TCK-663) : une
 * adresse rattachée au référentiel se juge par son `geo_neighborhood_id`, fusion suivie, et une
 * adresse non rattachée par la clé {@see CleDeQuartier} de son texte, qui ramène accents et tirets
 * (« Liberte 4 » trouve « Liberté 4 »). La clé se calcule en PHP, la base n'ayant pas `unaccent`
 * (TCK-1083, P67.04, P67.05). Quand ville et quartier sont donnés, les deux doivent correspondre.
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

    /** @var array<string, list<int>> saisie → quartiers du référentiel qu'elle désigne */
    private array $idsParSaisie = [];

    /** @var array<string, list<string>> saisie → textes d'adresses non rattachées de même clé */
    private array $textesParSaisie = [];

    /** @var array<string, list<string>>|null clé de ville → textes `addresses.city` qui l'ont */
    private ?array $villesParCle = null;

    public function __construct(
        private readonly QuartierDuFiltre $quartiers,
        private readonly VilleDuFiltre $villes,
    ) {}

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

        // TCK-1167 (P99.05) — les textes de ville des adresses qui ont la clé d'une saisie.
        $cities = $this->saisies($customer->seeking_cities);
        if ($cities !== []) {
            $textes = [];
            foreach ($cities as $saisie) {
                $textes = [...$textes, ...$this->villesDe($saisie)];
            }
            $query->whereExists(fn ($sub) => $this->adresseDuBien($sub)
                ->whereIn('addresses.city', array_values(array_unique($textes))));
        }

        // TCK-1083 (P67.04, P67.05) — la règle de `QuartierDuFiltre`, comme la recherche publique.
        $neighborhoods = $this->saisies($customer->seeking_neighborhoods);
        if ($neighborhoods !== []) {
            $ids = [];
            $textes = [];
            foreach ($neighborhoods as $saisie) {
                $ids = [...$ids, ...$this->idsDe($saisie)];
                $textes = [...$textes, ...$this->textesDe($saisie)];
            }

            $query->whereExists(fn ($sub) => $this->adresseDuBien($sub)
                ->where(fn ($q) => $q->whereIn('addresses.geo_neighborhood_id', array_values(array_unique($ids)))
                    ->orWhere(fn ($q) => $q->whereNull('addresses.geo_neighborhood_id')
                        ->whereIn('addresses.neighborhood', array_values(array_unique($textes))))));
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
        $this->whereListAccepts($query, 'seeking_property_types', $value($property->type));

        $address = $property->address()->first();
        $this->whereCityAccepts($query, $property->agency_id, $address);
        $this->whereNeighborhoodAccepts($query, $property->agency_id, $address);

        return $query;
    }

    /** @param  \Illuminate\Database\Query\Builder  $sub */
    private function adresseDuBien($sub)
    {
        return $sub->selectRaw('1')
            ->from('addresses')
            ->whereColumn('addresses.addressable_id', 'properties.id')
            ->where('addresses.addressable_type', Property::class);
    }

    /**
     * TCK-1083 (P67.04, P67.05) — le sens inverse de la règle de `propertiesFor()`. La clé ne se
     * calcule pas en SQL (pas d'`unaccent`) : les prospects de l'agence qui demandent des quartiers
     * sont jugés en PHP, et ceux qui acceptent l'adresse du bien retenus par identifiant.
     */
    private function whereNeighborhoodAccepts(Builder $query, int|string|null $agencyId, ?Address $address): void
    {
        $quartierId = $address?->geo_neighborhood_id;
        $cle = CleDeQuartier::de($address?->neighborhood);

        $accepte = fn (string $saisie): bool => $quartierId !== null
            ? in_array((int) $quartierId, $this->idsDe($saisie), true)
            : $cle !== null && CleDeQuartier::de($saisie) === $cle;

        $acceptants = ($quartierId === null && $cle === null) ? [] : Customer::query()
            ->where('customers.agency_id', $agencyId)
            ->whereRaw("jsonb_array_length(COALESCE(customers.seeking_neighborhoods, '[]'::jsonb)) > 0")
            ->get(['customers.id', 'customers.seeking_neighborhoods'])
            ->filter(fn (Customer $c) => array_filter($this->saisies($c->seeking_neighborhoods), $accepte) !== [])
            ->map(fn (Customer $c) => (int) $c->id)
            ->values()
            ->all();

        $query->where(fn (Builder $q) => $q
            ->whereRaw("jsonb_array_length(COALESCE(customers.seeking_neighborhoods, '[]'::jsonb)) = 0")
            ->orWhereIn('customers.id', $acceptants));
    }

    /**
     * TCK-1167 (P99.05) — le sens inverse : les prospects de l'agence dont une ville saisie a la
     * clé de la ville du bien, jugés en PHP comme les quartiers (pas d'`unaccent`).
     */
    private function whereCityAccepts(Builder $query, int|string|null $agencyId, ?Address $address): void
    {
        // TCK-1169 (P99.01) — et les anciens noms de sa ville, quand le jeu l'a renommée.
        $cles = array_values(array_filter([
            CleDeQuartier::de($address?->city),
            ...$this->villes->clesAnciennes($address?->geo_city_id !== null ? (int) $address->geo_city_id : null),
        ]));

        $acceptants = $cles === [] ? [] : Customer::query()
            ->where('customers.agency_id', $agencyId)
            ->whereRaw("jsonb_array_length(COALESCE(customers.seeking_cities, '[]'::jsonb)) > 0")
            ->get(['customers.id', 'customers.seeking_cities'])
            ->filter(fn (Customer $c) => array_filter(
                $this->saisies($c->seeking_cities),
                fn (string $saisie) => in_array(CleDeQuartier::de($saisie), $cles, true),
            ) !== [])
            ->map(fn (Customer $c) => (int) $c->id)
            ->values()
            ->all();

        $query->where(fn (Builder $q) => $q
            ->whereRaw("jsonb_array_length(COALESCE(customers.seeking_cities, '[]'::jsonb)) = 0")
            ->orWhereIn('customers.id', $acceptants));
    }

    /** @return list<string> les textes `addresses.city` qui ont la clé de la saisie */
    private function villesDe(string $saisie): array
    {
        $this->villesParCle ??= Address::query()
            ->whereNotNull('city')
            ->distinct()
            ->pluck('city')
            ->groupBy(static fn (string $texte) => (string) CleDeQuartier::de($texte))
            ->map(static fn ($textes) => $textes->values()->all())
            ->all();

        // TCK-1169 (P99.01) — un ancien nom désigne aussi les adresses au nom actuel de la ville.
        $textes = [];
        foreach ([$saisie, ...$this->villes->nomsActuels($saisie)] as $nom) {
            $cle = CleDeQuartier::de($nom);
            $textes = [...$textes, ...($cle === null ? [] : ($this->villesParCle[$cle] ?? []))];
        }

        return array_values(array_unique($textes));
    }

    /** @return list<string> */
    private function saisies(mixed $liste): array
    {
        return array_values(array_filter(
            array_map(fn ($v) => is_string($v) ? trim($v) : '', (array) ($liste ?? [])),
            fn (string $v) => $v !== '',
        ));
    }

    /** @return list<int> */
    private function idsDe(string $saisie): array
    {
        return $this->idsParSaisie[$saisie] ??= $this->quartiers->idsDuReferentiel($saisie);
    }

    /** @return list<string> */
    private function textesDe(string $saisie): array
    {
        return $this->textesParSaisie[$saisie] ??= $this->quartiers->textesLibres($saisie);
    }

    /** Une liste vide ou absente accepte tout ; sinon elle doit contenir la valeur. */
    private function whereListAccepts(Builder $query, string $column, ?string $candidate): void
    {
        $query->where(function (Builder $q) use ($column, $candidate) {
            $q->whereRaw("jsonb_array_length(COALESCE(customers.{$column}, '[]'::jsonb)) = 0");
            if ($candidate === null || trim($candidate) === '') {
                return;
            }

            $q->orWhereRaw("customers.{$column} @> ?::jsonb", [json_encode([$candidate])]);
        });
    }
}
