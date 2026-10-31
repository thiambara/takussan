<?php

namespace App\Services\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Jobs\RecordQueueHeartbeat;
use App\Models\Enums\PaymentProvider;
use App\Models\Integration;
use App\Models\Property;
use App\Services\Ai\AiProviderCatalogue;
use App\Services\Media\Cdn\CdnProviderContract;
use App\Support\RadarPhone;
use App\Support\TrustedProxyList;
use GuzzleHttp\Client as HttpClient;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Meilisearch\Client as MeilisearchClient;
use Meilisearch\Exceptions\ApiException;

/**
 * L'état de la plateforme, sonde par sonde (TCK-600, S15).
 *
 * Chaque sonde rend `status` (`ok|degraded|failed`) et `checked_at` ; le statut global est la pire
 * d'entre elles. Avant ce ticket, le courriel était `ok` dès que la config se lisait (la
 * préproduction est en `MAIL_MAILER=log`), le SMS `ok` sauf driver littéral `broken`, le stockage
 * sondé sur `local` quand les médias vivent sur R2, et ni Meilisearch, ni l'âge des jobs, ni les
 * workers n'étaient regardés : la page Santé disait « tout va bien » sans rien mesurer.
 *
 * Les sondes sont ACTIVES et BORNÉES : 3 s de délai sur chaque appel réseau (Meilisearch, SMTP,
 * disque S3). L'instantané vit 60 s en cache ; `health:probe` le rafraîchit chaque minute, et la
 * route publique ne lit que `STATUS_KEY` — jamais une sonde (`HealthController`).
 */
class HealthcheckService
{
    public const SNAPSHOT_KEY = 'health:snapshot';

    public const STATUS_KEY = 'health:status';

    public const TIMEOUT_SECONDS = 3;

    /** Un job disponible depuis plus longtemps rend sa file `degraded`, puis `failed`. */
    public const QUEUE_DEGRADED_AFTER_SECONDS = 600;

    public const QUEUE_FAILED_AFTER_SECONDS = 3600;

    /** Le battement part chaque minute : trois manqués → `degraded`, cinq → `failed`. */
    public const HEARTBEAT_DEGRADED_AFTER_SECONDS = 180;

    public const HEARTBEAT_FAILED_AFTER_SECONDS = 300;

    /**
     * TCK-2401 (ADR-0078) — `worker-long` n'écrit aucun battement pendant un job (ni `Looping` ni
     * `JobProcessed`), et ce qui attend derrière lui attend jusqu'à la fin de ce job. Ses seuils se
     * dérivent du délai de reprise de `database-long` — le plus long job possible —, pas des
     * constantes des files courtes : battement `failed` au-delà de ce délai, file `degraded`
     * au-delà d'un délai, `failed` au-delà de deux.
     */
    public const LONG_QUEUE = 'long';

    /** Aucune tâche planifiée terminée depuis cinq minutes : le planificateur est tenu pour arrêté (TCK-680). */
    public const SCHEDULER_FAILED_AFTER_SECONDS = 300;

    /** Taux d'échec SMS sur l'heure qui rend la sonde `degraded`, au-delà d'un échantillon minimal. */
    public const SMS_DEGRADED_FAILURE_RATE = 0.2;

    public const SMS_MIN_SAMPLE = 5;

    /** Écart toléré entre l'index des biens et `Property::public()` (l'indexation est asynchrone). */
    public const SEARCH_GAP_TOLERANCE = 10;

    private const RANK = ['ok' => 0, 'degraded' => 1, 'failed' => 2];

    public function __construct(
        private readonly CdnProviderContract $cdn,
        private readonly AiProviderCatalogue $aiProviders,
    ) {}

    /**
     * @return array<string,mixed>
     */
    public function snapshot(): array
    {
        return Cache::remember(self::SNAPSHOT_KEY, 60, fn (): array => $this->probe());
    }

    /**
     * Sonde tout, et remplace l'instantané et le statut public. Appelé par `health:probe`.
     *
     * @return array<string,mixed>
     */
    public function refresh(): array
    {
        $snapshot = $this->probe();
        Cache::put(self::SNAPSHOT_KEY, $snapshot, 60);

        return $snapshot;
    }

    /**
     * Le statut agrégé, sans détail, tel que la dernière sonde l'a laissé ; `unknown` quand aucune
     * sonde n'a tourné depuis dix minutes (planificateur arrêté).
     *
     * @return array{status:string,checked_at:?string}
     */
    public function publicStatus(): array
    {
        $stored = Cache::get(self::STATUS_KEY);

        return [
            'status' => $stored['status'] ?? 'unknown',
            'checked_at' => $stored['checked_at'] ?? null,
        ];
    }

    /**
     * @param  iterable<string>  $statuses
     */
    public static function worst(iterable $statuses): string
    {
        $worst = 'ok';
        foreach ($statuses as $status) {
            if ((self::RANK[$status] ?? 0) > self::RANK[$worst]) {
                $worst = $status;
            }
        }

        return $worst;
    }

    /**
     * @return array<string,mixed>
     */
    private function probe(): array
    {
        $probes = [
            'db' => $this->check(function (): array {
                $start = microtime(true);
                DB::select('select 1');

                return ['latency_ms' => (int) round((microtime(true) - $start) * 1000)];
            }),
            'cache' => $this->check(function (): array {
                $key = 'healthcheck:'.str()->uuid();
                Cache::put($key, 'ok', 10);

                return Cache::get($key) === 'ok' ? ['value' => 'ok'] : ['status' => 'failed', 'value' => 'miss'];
            }),
            'storage' => $this->check(fn (): array => $this->roundTrip(Storage::disk('local'))),
            'media_storage' => $this->check(fn (): array => $this->mediaStorage()),
            'mail' => $this->check(fn (): array => $this->mail()),
            'sms' => $this->check(fn (): array => $this->sms(), 'SMS driver unavailable'),
            'whatsapp' => $this->check(fn (): array => $this->whatsapp()),
            'search' => $this->check(fn (): array => $this->search()),
            'queue' => $this->check(fn (): array => $this->queue()),
            'workers' => $this->check(fn (): array => $this->workers()),
            'cdn' => $this->check(fn (): array => $this->cdn()),
            'scheduler' => $this->check(fn (): array => $this->scheduler()),
            'proxies' => $this->check(fn (): array => $this->proxies()),
            'lemon_squeezy_webhook' => $this->check(fn (): array => $this->lemonSqueezyWebhook()),
            'radar_phone_key' => $this->check(fn (): array => $this->radarPhoneKey()),
            'ai_providers' => $this->check(fn (): array => $this->aiProviders()),
        ];

        $snapshot = [
            ...$probes,
            'status' => self::worst(array_column($probes, 'status')),
            'generated_at' => BaseResource::instantOnWire(now()),
        ];

        Cache::put(self::STATUS_KEY, ['status' => $snapshot['status'], 'checked_at' => $snapshot['generated_at']], 600);

        return $snapshot;
    }

    /**
     * @return array<string,mixed>
     */
    private function roundTrip(Filesystem $disk): array
    {
        $path = 'healthcheck/'.str()->uuid().'.txt';
        $disk->put($path, 'ok');
        $ok = $disk->get($path) === 'ok';
        $disk->delete($path);

        return $ok ? ['value' => 'ok'] : ['status' => 'failed', 'value' => 'miss'];
    }

    /**
     * Les deux disques des médias (ADR-0029 : R2 en production), pas `local`.
     *
     * @return array<string,mixed>
     */
    private function mediaStorage(): array
    {
        $disks = array_values(array_unique([
            (string) config('media-library.public_disk_name'),
            (string) config('media-library.disk_name'),
        ]));
        foreach ($disks as $name) {
            $result = $this->roundTrip($this->boundedDisk($name));
            if (($result['status'] ?? 'ok') !== 'ok') {
                return [...$result, 'disk' => $name, 'disks' => $disks];
            }
        }

        return ['disks' => $disks];
    }

    private function boundedDisk(string $name): Filesystem
    {
        $config = config("filesystems.disks.{$name}");
        if (is_array($config) && ($config['driver'] ?? null) === 's3') {
            return Storage::build([
                ...$config,
                'http' => ['timeout' => self::TIMEOUT_SECONDS, 'connect_timeout' => self::TIMEOUT_SECONDS],
            ]);
        }

        return Storage::disk($name);
    }

    /**
     * `log` et `array` n'envoient rien : `degraded`, pas `ok`. SMTP : connexion au serveur.
     *
     * @return array<string,mixed>
     */
    private function mail(): array
    {
        $driver = (string) config('mail.default');
        $transport = (string) config("mail.mailers.{$driver}.transport", $driver);
        if (in_array($transport, ['log', 'array'], true)) {
            return ['status' => 'degraded', 'driver' => $driver, 'reason' => 'no_delivery'];
        }

        if ($transport === 'smtp') {
            $host = (string) config("mail.mailers.{$driver}.host");
            $port = (int) config("mail.mailers.{$driver}.port", 587);
            $socket = @fsockopen($host, $port, $errno, $errstr, self::TIMEOUT_SECONDS);
            if ($socket === false) {
                return ['status' => 'failed', 'driver' => $driver, 'reason' => 'unreachable'];
            }
            fclose($socket);
        }

        return ['driver' => $driver];
    }

    /**
     * Taux d'échec des tentatives SMS de l'heure. Les tentatives WhatsApp partagent la table : elles
     * sont écartées par leur fournisseur.
     *
     * @return array<string,mixed>
     */
    private function sms(): array
    {
        $driver = config('sms.default_driver', 'log');
        if ($driver === 'broken') {
            throw new \RuntimeException('SMS driver unavailable');
        }

        $attempts = DB::table('notification_delivery_attempts')
            ->where('created_at', '>=', now()->subHour())
            ->where('provider', 'not like', 'whatsapp%')
            ->selectRaw("count(*) as total, count(*) filter (where status in ('failed', 'deferred_to_fallback')) as failed")
            ->first();
        $total = (int) $attempts->total;
        $rate = $total > 0 ? round((int) $attempts->failed / $total, 3) : 0.0;

        return [
            ...($total >= self::SMS_MIN_SAMPLE && $rate >= self::SMS_DEGRADED_FAILURE_RATE ? ['status' => 'degraded'] : []),
            'driver' => $driver,
            'attempts_1h' => $total,
            'failure_rate_1h' => $rate,
        ];
    }

    /**
     * P72.05 (TCK-1091) — taux d'échec des tentatives WhatsApp, au même seuil que la sonde SMS. Il se
     * compte sur `updated_at`, et non sur `created_at` : l'échec WhatsApp arrive par l'accusé de Meta,
     * parfois des heures après l'envoi, et la sonde doit le voir dans l'heure où il est reçu. Seul
     * `failed` est un échec : `deferred_to_fallback` dit que WhatsApp n'était pas permis (hors fenêtre,
     * sans gabarit, contact retiré) et que le message est parti par SMS.
     *
     * @return array<string,mixed>
     */
    private function whatsapp(): array
    {
        $attempts = DB::table('notification_delivery_attempts')
            ->where('updated_at', '>=', now()->subHour())
            ->where('provider', 'like', 'whatsapp%')
            ->selectRaw("count(*) as total, count(*) filter (where status = 'failed') as failed")
            ->first();
        $total = (int) $attempts->total;
        $rate = $total > 0 ? round((int) $attempts->failed / $total, 3) : 0.0;

        return [
            ...($total >= self::SMS_MIN_SAMPLE && $rate >= self::SMS_DEGRADED_FAILURE_RATE ? ['status' => 'degraded'] : []),
            'driver' => config('whatsapp.default_driver', 'cloud'),
            'attempts_1h' => $total,
            'failure_rate_1h' => $rate,
        ];
    }

    /**
     * Santé de Meilisearch, et écart entre l'index des biens et `Property::public()`.
     *
     * @return array<string,mixed>
     */
    private function search(): array
    {
        $driver = (string) config('scout.driver');
        if ($driver !== 'meilisearch') {
            return ['status' => 'degraded', 'driver' => $driver, 'reason' => 'not_meilisearch'];
        }

        $client = new MeilisearchClient(
            (string) config('scout.meilisearch.host'),
            config('scout.meilisearch.key'),
            new HttpClient(['timeout' => self::TIMEOUT_SECONDS, 'connect_timeout' => self::TIMEOUT_SECONDS]),
        );
        $client->health();

        try {
            $documents = (int) ($client->index((new Property)->searchableAs())->stats()['numberOfDocuments'] ?? 0);
        } catch (ApiException $e) {
            if ($e->httpStatus !== 404) {
                throw $e;
            }
            $documents = 0;
        }
        $expected = Property::query()->public()->count();
        $gap = $expected - $documents;

        return [
            ...(abs($gap) > self::SEARCH_GAP_TOLERANCE ? ['status' => 'degraded'] : []),
            'documents' => $documents,
            'expected' => $expected,
            'gap' => $gap,
        ];
    }

    /**
     * Les comptes d'avant, et l'âge du plus vieux job DISPONIBLE, par file (un job différé n'attend
     * pas encore).
     *
     * @return array<string,mixed>
     */
    private function queue(): array
    {
        $now = now()->getTimestamp();
        $rows = DB::table('jobs')
            ->whereNull('reserved_at')
            ->where('available_at', '<=', $now)
            ->groupBy('queue')
            ->selectRaw('queue, count(*) as pending, min(available_at) as oldest')
            ->get();

        $queues = [];
        foreach ($rows as $row) {
            $age = $now - (int) $row->oldest;
            [$degradedAfter, $failedAfter] = $row->queue === self::LONG_QUEUE
                ? [$this->longRetryAfter(), 2 * $this->longRetryAfter()]
                : [self::QUEUE_DEGRADED_AFTER_SECONDS, self::QUEUE_FAILED_AFTER_SECONDS];
            $queues[$row->queue] = [
                'status' => $age >= $failedAfter
                    ? 'failed'
                    : ($age >= $degradedAfter ? 'degraded' : 'ok'),
                'pending' => (int) $row->pending,
                'oldest_pending_seconds' => $age,
            ];
        }

        return [
            'status' => self::worst(array_column($queues, 'status')),
            'pending' => DB::table('jobs')->whereNull('reserved_at')->count(),
            'processing' => DB::table('jobs')->whereNotNull('reserved_at')->count(),
            'failed_24h' => DB::table('failed_jobs')->where('failed_at', '>=', now()->subDay())->count(),
            'oldest_pending_seconds' => $queues === [] ? 0 : max(array_column($queues, 'oldest_pending_seconds')),
            'queues' => $queues,
        ];
    }

    /**
     * Le battement que `RecordQueueHeartbeat` dépose sur chacune des files. Une file sans
     * worker ne lève rien : seule l'absence de battement la trahit.
     *
     * @return array<string,mixed>
     */
    private function workers(): array
    {
        $now = now()->getTimestamp();
        $queues = [];
        foreach (RecordQueueHeartbeat::QUEUES as $queue) {
            $beat = Cache::get(RecordQueueHeartbeat::cacheKey($queue));
            $age = $beat === null ? null : $now - (int) $beat;
            [$degradedAfter, $failedAfter] = $queue === self::LONG_QUEUE
                ? [$this->longRetryAfter(), $this->longRetryAfter()]
                : [self::HEARTBEAT_DEGRADED_AFTER_SECONDS, self::HEARTBEAT_FAILED_AFTER_SECONDS];
            $queues[$queue] = [
                'status' => $age === null || $age >= $failedAfter
                    ? 'failed'
                    : ($age >= $degradedAfter ? 'degraded' : 'ok'),
                'last_heartbeat_seconds' => $age,
            ];
        }

        return ['status' => self::worst(array_column($queues, 'status')), 'queues' => $queues];
    }

    /** Le délai de reprise de `database-long` (ADR-0078) : rien n'y vit plus longtemps. */
    private function longRetryAfter(): int
    {
        return (int) config('queue.connections.database-long.retry_after');
    }

    /**
     * La dernière exécution enregistrée dans `scheduled_task_runs`. Elle ne comptait pas dans le
     * statut global : un planificateur arrêté laissait la plateforme `ok` (TCK-680, P14.02). Aucune
     * exécution du tout vaut un planificateur qui n'a jamais tourné, donc `failed`.
     *
     * @return array<string,mixed>
     */
    private function scheduler(): array
    {
        $lastRunAt = DB::table('scheduled_task_runs')->latest('last_run_at')->value('last_run_at');
        $age = $lastRunAt === null ? null : now()->getTimestamp() - Carbon::parse($lastRunAt)->getTimestamp();

        return [
            ...($age === null || $age >= self::SCHEDULER_FAILED_AFTER_SECONDS ? ['status' => 'failed'] : []),
            // TCK-1116 (P94.01) — la valeur brute n'a pas de fuseau : un instant ADR-0018.
            'last_run_at' => $lastRunAt === null ? null : Carbon::parse($lastRunAt)->utc()->format(DATE_ATOM),
        ];
    }

    /**
     * Sondé ici, sur la page de la console — plus par la route publique.
     *
     * @return array<string,mixed>
     */
    private function cdn(): array
    {
        if (! config('cdn.enabled')) {
            return ['value' => 'disabled'];
        }

        return $this->cdn->healthCheck() ? ['value' => 'ok'] : ['status' => 'degraded', 'value' => 'degraded'];
    }

    /**
     * TCK-853 (P37.06) — `TRUSTED_PROXIES` qui contient `*` ne croit PERSONNE (`TrustedProxyList`) :
     * tous les clients prennent l'IP du mandataire, et partagent un seau dans chaque limiteur.
     * Rien ne le refuse au démarrage (décision du porteur) : la sonde le dit, et le journal le crie
     * à chaque passage de `health:probe`.
     *
     * @return array<string,mixed>
     */
    private function proxies(): array
    {
        if (! TrustedProxyList::hasWildcard(TrustedProxyList::fromEnvironment())) {
            return [];
        }

        Log::critical('[health] TRUSTED_PROXIES contient `*`, qui ne croit aucun mandataire : tous les clients prennent l’IP du mandataire.');

        return ['status' => 'degraded', 'reason' => 'wildcard_trusts_nobody'];
    }

    /**
     * P98.08 (TCK-1172) — une intégration Lemon Squeezy de plateforme active, sans secret de
     * signature en configuration : la route des webhooks refuse tout
     * (`RequireLemonSqueezySigningSecret`), quoi que dise le `signing_secret` saisi dans la console.
     *
     * @return array<string,mixed>
     */
    private function lemonSqueezyWebhook(): array
    {
        if ((string) config('lemon-squeezy.signing_secret', '') !== '') {
            return [];
        }

        $active = Integration::query()
            ->where('provider', PaymentProvider::LemonSqueezy->value)
            ->whereNull('agency_id')
            ->where('is_active', true)
            ->exists();

        return $active ? ['status' => 'degraded', 'reason' => 'signing_secret_missing'] : [];
    }

    /**
     * TCK-2414 (ADR-0077 §9) — hors `local` et `testing`, la clé dédiée de l'empreinte des refus du Radar
     * (`RADAR_PHONE_HMAC_KEY`). Sans elle, l'empreinte dérive d'`APP_KEY` : une rotation sans `APP_PREVIOUS_KEYS`
     * rendrait méconnaissables les numéros qui ont dit STOP, purgés en clair. `degraded` : rien ne casse aujourd'hui.
     *
     * @return array<string,mixed>
     */
    private function radarPhoneKey(): array
    {
        if (RadarPhone::hasDedicatedKey() || app()->environment(['local', 'testing'])) {
            return [];
        }

        return ['status' => 'degraded', 'reason' => 'radar_phone_key_missing'];
    }

    /**
     * TCK-2450 (ADR-0085 §3) — une clé posée sur une adresse hors de ses hôtes : le fournisseur ne reçoit rien, et
     * ses maillons basculent sans autre signal. Une clé absente n'est pas un défaut : c'est l'état par défaut. L'hôte
     * est le seul détail de l'adresse qui sorte.
     *
     * @return array<string,mixed>
     */
    private function aiProviders(): array
    {
        $refused = $this->aiProviders->keyedWithRefusedAddress();

        return $refused === [] ? [] : ['status' => 'degraded', 'reason' => 'ai_provider_host_not_allowed', 'providers' => $refused];
    }

    /**
     * @param  callable(): array<string,mixed>  $callback
     * @return array<string,mixed>
     */
    private function check(callable $callback, ?string $publicError = null): array
    {
        $checkedAt = BaseResource::instantOnWire(now());
        try {
            return ['status' => 'ok', ...$callback(), 'checked_at' => $checkedAt];
        } catch (\Throwable $e) {
            return [
                'status' => 'failed',
                'error' => $publicError ?? str($e->getMessage())->limit(300)->toString(),
                'checked_at' => $checkedAt,
            ];
        }
    }
}
