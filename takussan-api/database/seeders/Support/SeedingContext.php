<?php

namespace Database\Seeders\Support;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Faker\Factory as FakerFactory;
use Faker\Generator as FakerGenerator;
use Illuminate\Support\Collection;

/**
 * In-memory cache of entities created during the year-of-activity seed.
 *
 * The orchestrator boots an instance once and passes it to each seeder so
 * they can share lookups (agencies, users by role per agency, active leases)
 * without hitting the DB repeatedly.
 */
class SeedingContext
{
    private FakerGenerator $faker;

    /** @var Collection<int, Agency> */
    public Collection $agencies;

    /** @var array<int, Collection<int, User>> keyed by agency_id, value = users of that agency */
    public array $usersByAgency = [];

    /** @var array<int, array<string, Collection<int, User>>> keyed by agency_id then by UserType value */
    public array $usersByAgencyAndType = [];

    /** @var array<int, Collection<int, Customer>> keyed by agency_id */
    public array $customersByAgency = [];

    /** @var array<int, Collection<int, Property>> keyed by agency_id */
    public array $propertiesByAgency = [];

    /** @var Collection<int, Lease> */
    public Collection $leases;

    /** @var Collection<int, Lease> */
    public Collection $activeLeases;

    /** @var Collection<int, User> super admins and system users */
    public Collection $systemUsers;

    public function __construct()
    {
        $this->agencies = new Collection;
        $this->leases = new Collection;
        $this->activeLeases = new Collection;
        $this->systemUsers = new Collection;

        $this->bootFaker();
    }

    public function faker(): FakerGenerator
    {
        return $this->faker;
    }

    /**
     * Boot a French faker with the Senegal provider attached and a fixed seed
     * for reproducible runs.
     */
    private function bootFaker(): void
    {
        $faker = FakerFactory::create('fr_FR');
        $faker->addProvider(new SenegalFakerProvider($faker));
        $faker->seed(2026);

        $this->faker = $faker;
    }

    public function registerAgency(Agency $agency): void
    {
        $this->agencies->put($agency->id, $agency);
        $this->usersByAgency[$agency->id] = new Collection;
        $this->usersByAgencyAndType[$agency->id] = [];
        $this->customersByAgency[$agency->id] = new Collection;
        $this->propertiesByAgency[$agency->id] = new Collection;
    }

    public function registerUser(User $user): void
    {
        if ($user->agency_id !== null && $this->agencies->has($user->agency_id)) {
            $this->usersByAgency[$user->agency_id]->put($user->id, $user);

            $type = $user->type?->value ?? 'unknown';
            $bucket = $this->usersByAgencyAndType[$user->agency_id][$type] ?? new Collection;
            $bucket->put($user->id, $user);
            $this->usersByAgencyAndType[$user->agency_id][$type] = $bucket;
        } else {
            $this->systemUsers->put($user->id, $user);
        }
    }

    public function registerCustomer(Customer $customer): void
    {
        if ($customer->agency_id !== null && $this->agencies->has($customer->agency_id)) {
            $this->customersByAgency[$customer->agency_id]->put($customer->id, $customer);
        }
    }

    public function registerProperty(Property $property): void
    {
        if ($property->agency_id !== null && $this->agencies->has($property->agency_id)) {
            $this->propertiesByAgency[$property->agency_id]->put($property->id, $property);
        }
    }

    /** @return Collection<int, User> */
    public function usersOfType(int $agencyId, string $type): Collection
    {
        return $this->usersByAgencyAndType[$agencyId][$type] ?? new Collection;
    }
}
