<?php

namespace Database\Seeders\Support;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Lease;
use App\Models\PayoutMethod;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Database\Seeders\YearOfActivitySeeder;
use Faker\Generator as FakerGenerator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Spatie\MediaLibrary\HasMedia;
use Symfony\Component\Console\Output\OutputInterface;

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

    private SeedTexts $texts;

    public SeedingConfig $config;

    /** @var Collection<int, Agency> */
    public Collection $agencies;

    /** @var array<int, Collection<int, User>> keyed by agency_id, value = users of that agency */
    public array $usersByAgency = [];

    /**
     * Users bucketed by agency, then by **persona** — matches the spatie role
     * name so callers can bridge between identity and authorization without
     * an extra mapping table. Allowed personas: admin, agent, owner,
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

    /** @var array<int, float> taille relative de chaque agence, par agency_id (TCK-2378) */
    public array $tailles = [];

    /** @var array<int, CarbonImmutable> date de départ des collaborateurs partis, par user_id (TCK-2378) */
    public array $departs = [];

    /** @var array<int, PayoutMethod> le moyen de reversement par défaut de chaque bailleur, par user_id (TCK-2379) */
    public array $moyensDeReversement = [];

    private ?User $operateur = null;

    /** Téléchargements de médias tentés — cf. {@see downloadMedia()}. */
    private int $mediaAttempted = 0;

    /** Téléchargements de médias qui n'ont attaché aucun fichier. */
    private int $mediaFailed = 0;

    /** @var array<string, int> raison d'échec => nombre d'occurrences */
    private array $mediaFailureReasons = [];

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
     * Boot a French faker with the Senegal provider attached, on the seed's
     * graine — which also seeds every {@see Tirage} (TCK-2380).
     */
    private function bootFaker(): void
    {
        $faker = SeedFaker::create('fr_FR');
        $faker->addProvider(new SenegalFakerProvider($faker));
        Tirage::graine($this->config->graine);

        $this->faker = $faker;
        $this->texts = new SeedTexts($faker);
    }

    /** Le texte métier des seeders, tiré sur la même graine. */
    public function texts(): SeedTexts
    {
        return $this->texts;
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
     * Bucket the user under its agency and persona (admin/agent/owner/
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

    /**
     * Le super-admin semé par UserSeeder : l'auteur des gestes de la plateforme — abonnements,
     * vérifications KYC, vedettes offertes, modération (TCK-2379).
     */
    public function operateur(): User
    {
        return $this->operateur ??= User::query()->findOrFail(PlatformProfile::query()
            ->where('level', PlatformProfileLevel::SuperAdmin)
            ->orderBy('id')
            ->value('user_id'));
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
     * Un volume « par agence » de la configuration, à la taille de cette agence (TCK-2378) : les
     * quatre agences avaient 214 biens et 141 clients chacune, agence individuelle comprise.
     */
    public function volume(int $parAgence, int $agencyId): int
    {
        return max(1, (int) round($parAgence * ($this->tailles[$agencyId] ?? 1.0)));
    }

    /**
     * Ceux qui suivent les dossiers de l'agence : ses agents, ou son titulaire quand elle n'en a pas
     * — une agence `individual` est une personne seule (TCK-2378).
     *
     * @return Collection<int, User>
     */
    public function equipe(int $agencyId): Collection
    {
        $agents = $this->usersWithProfile(AgentProfile::class, $agencyId);

        return $agents->isNotEmpty() ? $agents : ($this->usersByAgencyAndPersona[$agencyId]['admin'] ?? new Collection);
    }

    /**
     * Un membre de l'équipe présent à cette date : arrivé avant, et pas encore parti. Sans personne
     * de présent, le plus ancien — un acte n'est jamais sans agent.
     */
    public function agentAu(int $agencyId, CarbonInterface $date): ?int
    {
        $equipe = $this->equipe($agencyId);
        $presents = $equipe->filter(fn (User $u) => $u->created_at->lessThanOrEqualTo($date)
            && (! isset($this->departs[$u->id]) || $this->departs[$u->id]->greaterThan($date)));

        if ($presents->isEmpty()) {
            return $equipe->sortBy('created_at')->first()?->id;
        }

        return Tirage::un($presents->pluck('id'));
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
     *
     * ⚠ Les échecs restent NON BLOQUANTS ici — une photo manquante ne doit pas
     * interrompre un pipeline de 40 seeders au 38ᵉ. Mais ils ne sont plus MUETS :
     * chaque tentative et chaque échec est compté, avec sa raison, et
     * {@see YearOfActivitySeeder} imprime le bilan puis sort en
     * erreur au-delà du seuil. C'est la différence entre « le seeder a survécu » et
     * « le jeu de données est complet » — le code précédent affirmait la seconde en
     * ne mesurant que la première (TCK-301).
     */
    public function downloadMedia(HasMedia $model, string $url, string $collection): void
    {
        if (! config('database.seed_download_media', false)) {
            return;
        }

        $this->mediaAttempted++;

        try {
            $cachedPath = $this->resolveCachedMedia($url);
            if ($cachedPath === null) {
                // La raison a déjà été enregistrée par resolveCachedMedia().
                return;
            }

            $model->addMedia($cachedPath)
                ->preservingOriginal()
                ->toMediaCollection($collection);
        } catch (\Throwable $e) {
            // Hors ligne, DNS, timeout, quota, ou rejet de medialibrary : on ne
            // casse pas le seeding, on l'inscrit au compte.
            $this->recordMediaFailure(class_basename($e).' : '.$e->getMessage());
        }
    }

    /**
     * Part d'échecs de téléchargement de médias au-delà de laquelle le seeding sort
     * en erreur au lieu de se déclarer réussi.
     *
     * Un seuil et non zéro : picsum.photos rend un 5xx sporadique sous rafale, et
     * faire échouer un `migrate:fresh --seed` de vingt minutes sur une photo perdue
     * apprendrait à ignorer le message. 10 % ne se franchit pas par accident — c'est
     * la signature d'un réseau coupé, d'un proxy, ou d'un quota.
     */
    private const MEDIA_FAILURE_RATIO_THRESHOLD = 0.10;

    /**
     * Imprime le bilan des téléchargements de médias, et LÈVE au-delà du seuil.
     *
     * Sans ce bilan, `SeedingContext::downloadMedia()` avalait chaque échec dans un
     * `catch (\Throwable) {}` vide : hors ligne, derrière un proxy, ou simplement
     * limité par picsum.photos, `migrate:fresh --seed` sortait en 0 sur une base où
     * aucune photo n'avait été attachée. Le jeu de données était incomplet, et
     * personne ne pouvait le savoir — ni le développeur, ni la CI.
     *
     * Publique depuis TCK-3013 (ADR-0140 § 5) : le seeder l'appelle en dernier, et les tests
     * l'éprouvent par cette porte, sans réflexion sur une méthode privée du seeder.
     *
     * *Un échec avalé est pire qu'un échec bruyant : il déplace le coût du moment où
     * il survient vers le moment où on s'appuie dessus.* (TCK-301)
     */
    public function rapporterLesTelechargementsDeMedias(?OutputInterface $out): void
    {
        $attempted = $this->mediaDownloadAttempts();

        // Zéro tentative n'est pas un échec : c'est SEED_DOWNLOAD_MEDIA=false, le
        // défaut. On ne bruite pas un chemin nominal.
        if ($attempted === 0) {
            return;
        }

        $failed = $this->mediaDownloadFailures();
        $out?->writeln(sprintf(
            '  > Médias : %d téléchargement(s) tenté(s), %d réussi(s), %d échec(s)',
            $attempted,
            $attempted - $failed,
            $failed,
        ));

        foreach ($this->mediaFailureReasons() as $raison => $nombre) {
            $out?->writeln("    · {$nombre}× {$raison}");
        }

        if ($failed === 0) {
            return;
        }

        $ratio = $failed / $attempted;
        if ($ratio <= self::MEDIA_FAILURE_RATIO_THRESHOLD) {
            return;
        }

        throw new \RuntimeException(sprintf(
            'Seeding des médias INCOMPLET : %d des %d téléchargements ont échoué (%.1f %%, '
            .'seuil %.0f %%). La base est semée mais son jeu de médias est partiel. '
            .'Pose SEED_DOWNLOAD_MEDIA=false pour semer sans médias (c\'est le défaut), '
            .'ou corrige l\'accès réseau puis relance — le cache '
            .'storage/app/seed-media-cache/ conserve ce qui a déjà été téléchargé.',
            $failed,
            $attempted,
            $ratio * 100,
            self::MEDIA_FAILURE_RATIO_THRESHOLD * 100,
        ));
    }

    /** Nombre de médias dont le téléchargement a été TENTÉ (0 si SEED_DOWNLOAD_MEDIA est faux). */
    public function mediaDownloadAttempts(): int
    {
        return $this->mediaAttempted;
    }

    /** Nombre de tentatives qui n'ont abouti à aucun média attaché. */
    public function mediaDownloadFailures(): int
    {
        return $this->mediaFailed;
    }

    /**
     * Raisons d'échec agrégées, la plus fréquente d'abord.
     *
     * @return array<string, int>
     */
    public function mediaFailureReasons(): array
    {
        $reasons = $this->mediaFailureReasons;
        arsort($reasons);

        return $reasons;
    }

    /**
     * Un échec compte UNE fois par tentative, quelle que soit la profondeur à
     * laquelle il survient — sans quoi une même URL ratée gonflerait le compte
     * deux fois (HTTP puis exception) et le taux d'échec dépasserait 100 %.
     */
    private function recordMediaFailure(string $reason): void
    {
        $this->mediaFailed++;

        // La raison est TRONQUÉE : un message d'exception réseau embarque l'URL
        // complète, et le bilan de fin de seeding deviendrait une liste de 2700
        // lignes distinctes au lieu d'un histogramme lisible.
        $reason = trim(preg_replace('/\s+/', ' ', $reason) ?? $reason);
        $reason = mb_strimwidth($reason, 0, 120, '…');

        $this->mediaFailureReasons[$reason] = ($this->mediaFailureReasons[$reason] ?? 0) + 1;
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
            $this->recordMediaFailure('HTTP '.$response->status());

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
