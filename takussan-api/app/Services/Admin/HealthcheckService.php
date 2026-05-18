<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class HealthcheckService
{
    public function snapshot(): array
    {
        return [
            'db' => $this->check('db', function (): array {
                $start = microtime(true);
                DB::select('select 1');

                return ['latency_ms' => (int) round((microtime(true) - $start) * 1000)];
            }),
            'cache' => $this->check('cache', function (): array {
                $key = 'healthcheck:'.str()->uuid();
                Cache::put($key, 'ok', 10);

                return ['value' => Cache::get($key) === 'ok' ? 'ok' : 'miss'];
            }),
            'storage' => $this->check('storage', function (): array {
                $path = 'healthcheck/'.str()->uuid().'.txt';
                Storage::disk('local')->put($path, 'ok');
                $ok = Storage::disk('local')->get($path) === 'ok';
                Storage::disk('local')->delete($path);

                return ['value' => $ok ? 'ok' : 'miss'];
            }),
            'mail' => $this->check('mail', fn (): array => ['driver' => config('mail.default')]),
            'sms' => $this->check('sms', function (): array {
                $driver = config('sms.default_driver', 'log');
                if ($driver === 'broken') {
                    throw new \RuntimeException('SMS driver unavailable');
                }

                return ['driver' => $driver];
            }),
            'queue' => [
                'pending' => DB::table('jobs')->whereNull('reserved_at')->count(),
                'processing' => DB::table('jobs')->whereNotNull('reserved_at')->count(),
                'failed_24h' => DB::table('failed_jobs')->where('failed_at', '>=', now()->subDay())->count(),
            ],
            'scheduler' => [
                'last_run_at' => DB::table('scheduled_task_runs')->latest('last_run_at')->value('last_run_at'),
            ],
            'generated_at' => now()->toISOString(),
        ];
    }

    private function check(string $name, callable $callback): array
    {
        try {
            return [
                'status' => 'ok',
                ...$callback(),
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'failed',
                'error' => $name === 'sms' ? 'SMS driver unavailable' : $e->getMessage(),
            ];
        }
    }
}
