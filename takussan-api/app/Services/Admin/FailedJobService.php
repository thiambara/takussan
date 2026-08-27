<?php

namespace App\Services\Admin;

use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class FailedJobService
{
    public const BULK_RETRY_LIMIT = 500;

    /** Longueur, EN CARACTÈRES, des traces rendues par la liste. Le détail ne tronque pas. */
    public const TRUNCATE_LENGTH = 1024;

    public function paginate(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        // ⚠ Le DÉPART-ÉGALITÉ n'est pas décoratif. `failed_jobs.failed_at` est un `timestamp(0)` :
        // une rafale d'échecs — le cas courant — donne des dizaines de lignes à la MÊME valeur, et
        // PostgreSQL ne garantit alors aucun ordre stable entre deux requêtes LIMIT/OFFSET.
        // Mesuré avant correctif : 200 jobs à `failed_at` identique lus sur 10 pages rendaient
        // 197 identifiants distincts — 3 vus deux fois, 3 JAMAIS atteignables. `id` est unique,
        // il suffit à rendre l'ordre total.
        $query = DB::table('failed_jobs')->orderByDesc('failed_at')->orderByDesc('id');
        if (! empty($filters['queue'])) {
            $query->where('queue', $filters['queue']);
        }

        return $query->paginate($perPage)->through(fn ($job) => $this->present($job));
    }

    public function find(int $id): array
    {
        $job = DB::table('failed_jobs')->where('id', $id)->first();
        abort_unless($job, 404);

        return $this->present($job, false);
    }

    public function retry(int $id): void
    {
        abort_unless(DB::table('failed_jobs')->where('id', $id)->exists(), 404);
        Artisan::call('queue:retry', ['id' => [$id]]);
    }

    public function retryAll(): int
    {
        $count = DB::table('failed_jobs')->count();
        abort_if($count > self::BULK_RETRY_LIMIT, 409, 'Too many failed jobs to retry at once.');
        if ($count > 0) {
            Artisan::call('queue:retry', ['id' => ['all']]);
        }

        return $count;
    }

    public function delete(int $id): void
    {
        // Le 404 vient du COMPTE de lignes supprimées, pas d'un `exists()` préalable : deux
        // exploitants sur la même page suppriment le même job, et c'est le second qui doit voir
        // « déjà supprimé ». Un 200 muet ferait écrire au journal d'audit une suppression qui
        // n'a pas eu lieu — `retry()` et `find()` rendent 404 dans ce cas, celui-ci rendait 200.
        abort_if(DB::table('failed_jobs')->where('id', $id)->delete() === 0, 404);
    }

    private function present(object $job, bool $truncate = true): array
    {
        return [
            'id' => $job->id,
            'uuid' => $job->uuid,
            'connection' => $job->connection,
            'queue' => $job->queue,
            'payload' => $truncate ? $this->truncate((string) $job->payload) : $job->payload,
            'exception' => $truncate ? $this->truncate((string) $job->exception) : $job->exception,
            'failed_at' => $job->failed_at,
        ];
    }

    /**
     * Coupe une trace à 1024 CARACTÈRES — jamais à 1024 octets.
     *
     * ⚠ `substr()` coupait au milieu d'une séquence UTF-8 : la chaîne devenait invalide et
     * `JsonResponse` levait `Malformed UTF-8 characters`, ce qui faisait rendre 500 à TOUTE la
     * liste, pas à la seule ligne fautive. Mesuré : 3 décalages d'octet sur 6 suffisaient. Et le
     * cas n'a rien de théorique — `exception` porte des traces de pile BRUTES (non échappées en
     * `\uXXXX` contrairement au payload JSON), donc accentuées dans un dépôt francophone.
     */
    private function truncate(string $value): string
    {
        return mb_strlen($value) > self::TRUNCATE_LENGTH
            ? mb_substr($value, 0, self::TRUNCATE_LENGTH - 3).'...'
            : $value;
    }
}
