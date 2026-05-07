<?php

namespace App\Services\Admin;

use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class FailedJobService
{
    public const BULK_RETRY_LIMIT = 500;

    public function paginate(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = DB::table('failed_jobs')->orderByDesc('failed_at');
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
        DB::table('failed_jobs')->where('id', $id)->delete();
    }

    private function present(object $job, bool $truncate = true): array
    {
        $payload = (string) $job->payload;

        return [
            'id' => $job->id,
            'uuid' => $job->uuid,
            'connection' => $job->connection,
            'queue' => $job->queue,
            'payload' => $truncate && strlen($payload) > 1024 ? substr($payload, 0, 1021).'...' : $payload,
            'exception' => $truncate && strlen((string) $job->exception) > 1024 ? substr((string) $job->exception, 0, 1021).'...' : $job->exception,
            'failed_at' => $job->failed_at,
        ];
    }
}
