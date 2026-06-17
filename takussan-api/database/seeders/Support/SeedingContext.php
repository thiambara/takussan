<?php

namespace Database\Seeders\Support;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Faker\Factory as FakerFactory;
use Faker\Generator as FakerGenerator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Spatie\MediaLibrary\HasMedia;

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

    public SeedingConfig $config;

    /** @var Collection<int, Agency> */
    public Collection $agencies;

    /** @var array<int, Collection<int, User>> keyed by agency_id, value = users of that agency */
    public array $usersByAgency = [];

    /**
     * Users bucketed by agency, then by **persona** — matches the spatie role
     * name so callers can bridge between identity and authorization without
     * an extra mapping table. Allowed personas: admin, agent, owner, broker,
     * service_provider.
     *
     * @var array<int, array<string, Collection<int, User>>>
     */
    public array $usersByAgencyAndPersona = [];

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

    public function __construct(?SeedingConfig $config = null)
    {
        $this->config = $config ?? SeedingConfig::demo();
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
        $this->usersByAgencyAndPersona[$agency->id] = [];
        $this->customersByAgency[$agency->id] = new Collection;
        $this->propertiesByAgency[$agency->id] = new Collection;
    }

    /**
     * Bucket the user under its agency and persona (admin/agent/owner/broker/
     * service_provider). When `$persona` is null, the user is treated as a
     * cross-tenant system user (super admins, …) and stored apart.
     */
    public function registerUser(User $user, ?string $persona = null, ?int $agencyId = null): void
    {
        if ($persona !== null && $agencyId !== null && $this->agencies->has($agencyId)) {
            $this->usersByAgency[$agencyId]->put($user->id, $user);
            $bucket = $this->usersByAgencyAndPersona[$agencyId][$persona] ?? new Collection;
            $bucket->put($user->id, $user);
            $this->usersByAgencyAndPersona[$agencyId][$persona] = $bucket;
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

    /**
     * Look up users bucketed under a given profile class for an agency. The
     * profile class is mapped to the matching persona internally so callers
     * use type-safe references (`OwnerProfile::class`) rather than free-form
     * strings.
     *
     * @return Collection<int, User>
     */
    public function usersWithProfile(string $profileClass, int $agencyId): Collection
    {
        $persona = match ($profileClass) {
            OwnerProfile::class => 'owner',
            AgentProfile::class => 'agent',
            BrokerProfile::class => 'broker',
            ServiceProviderProfile::class => 'service_provider',
            default => null,
        };

        if ($persona === null) {
            return new Collection;
        }

        return $this->usersByAgencyAndPersona[$agencyId][$persona] ?? new Collection;
    }

    /**
     * Helper to download media from a URL during seeding, and attach it to a model.
     * Controlled by the SEED_DOWNLOAD_MEDIA environment variable flag.
     *
     * Uses a local file cache (`storage/app/seed-media-cache/`) keyed by sha1(url)
     * so re-seeding (e.g. `migrate:fresh --seed`) reuses already-downloaded files
     * instead of hitting the network every time.
     */
    public function downloadMedia(HasMedia $model, string $url, string $collection): void
    {
        if (! config('database.seed_download_media', false)) {
            return;
        }

        try {
            $cachedPath = $this->resolveCachedMedia($url);
            if ($cachedPath === null) {
                return;
            }

            $model->addMedia($cachedPath)
                ->preservingOriginal()
                ->toMediaCollection($collection);
        } catch (\Throwable $e) {
            // Silently ignore if image download fails (offline, rate limits, timeout)
            // to not break the database seeding process.
        }
    }

    private function resolveCachedMedia(string $url): ?string
    {
        $cacheDir = storage_path('app/seed-media-cache');
        if (! is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }

        $key = sha1($url);
        $existing = glob("{$cacheDir}/{$key}.*");
        if (! empty($existing)) {
            return $existing[0];
        }

        $response = Http::timeout(15)->get($url);
        if (! $response->successful()) {
            return null;
        }

        $ext = $this->guessExtension($response->header('Content-Type'), $url);
        $path = "{$cacheDir}/{$key}.{$ext}";
        file_put_contents($path, $response->body());

        return $path;
    }

    private function guessExtension(?string $contentType, string $url): string
    {
        return match (true) {
            str_contains((string) $contentType, 'jpeg') => 'jpg',
            str_contains((string) $contentType, 'png') => 'png',
            str_contains((string) $contentType, 'webp') => 'webp',
            str_contains((string) $contentType, 'gif') => 'gif',
            default => pathinfo(parse_url($url, PHP_URL_PATH) ?: '', PATHINFO_EXTENSION) ?: 'jpg',
        };
    }
}
