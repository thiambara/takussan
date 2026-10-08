<?php

namespace App\Services\Admin;

use App\Jobs\RecordQueueHeartbeat;
use App\Models\Property;
use App\Services\Media\Cdn\CdnProviderContract;
use GuzzleHttp\Client as HttpClient;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
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

    /** Taux d'échec SMS sur l'heure qui rend la sonde `degraded`, au-delà d'un échantillon minimal. */
    public const SMS_DEGRADED_FAILURE_RATE = 0.2;

    public const SMS_MIN_SAMPLE = 5;

    /** Écart toléré entre l'index des biens et `Property::public()` (l'indexation est asynchrone). */
    public const SEARCH_GAP_TOLERANCE = 10;

    private const RANK = ['ok' => 0, 'degraded' => 1, 'failed' => 2];

    public function __construct(private readonly CdnProviderContract $cdn) {}

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
            'search' => $this->check(fn (): array => $this->search()),
            'queue' => $this->check(fn (): array => $this->queue()),
            'workers' => $this->check(fn (): array => $this->workers()),
            'cdn' => $this->check(fn (): array => $this->cdn()),
        ];

        $snapshot = [
            ...$probes,
            'scheduler' => [
                'last_run_at' => DB::table('scheduled_task_runs')->latest('last_run_at')->value('last_run_at'),
            ],
            'status' => self::worst(array_column($probes, 'status')),
            'generated_at' => now()->toISOString(),
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
            $queues[$row->queue] = [
                'status' => $age >= self::QUEUE_FAILED_AFTER_SECONDS
                    ? 'failed'
                    : ($age >= self::QUEUE_DEGRADED_AFTER_SECONDS ? 'degraded' : 'ok'),
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
     * Le battement que `RecordQueueHeartbeat` dépose sur chacune des quatre files. Une file sans
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
            $queues[$queue] = [
                'status' => $age === null || $age >= self::HEARTBEAT_FAILED_AFTER_SECONDS
                    ? 'failed'
                    : ($age >= self::HEARTBEAT_DEGRADED_AFTER_SECONDS ? 'degraded' : 'ok'),
                'last_heartbeat_seconds' => $age,
            ];
        }

        return ['status' => self::worst(array_column($queues, 'status')), 'queues' => $queues];
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
     * @param  callable(): array<string,mixed>  $callback
     * @return array<string,mixed>
     */
    private function check(callable $callback, ?string $publicError = null): array
    {
        $checkedAt = now()->toISOString();
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
