<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Media\Cdn\CdnProviderContract;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Queue;

class HealthController extends Controller
{
    public function __invoke(CdnProviderContract $cdn): JsonResponse
    {
        $cdnStatus = $this->checkCdn($cdn);
        $queueStatus = $this->checkQueue();

        return $this->json([
            'status' => $cdnStatus === 'ok' && $queueStatus === 'ok' ? 'ok' : 'degraded',
            'checks' => [
                'cdn' => $cdnStatus,
                'queue' => $queueStatus,
            ],
        ]);
    }

    private function checkCdn(CdnProviderContract $cdn): string
    {
        if (! config('cdn.enabled')) {
            return 'disabled';
        }

        try {
            return $cdn->healthCheck() ? 'ok' : 'degraded';
        } catch (\Throwable) {
            return 'degraded';
        }
    }

    private function checkQueue(): string
    {
        try {
            Queue::size();

            return 'ok';
        } catch (\Throwable) {
            return 'degraded';
        }
    }
}
