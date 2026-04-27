<?php

namespace App\Http\Controllers\Api\Media;

use App\Http\Controllers\Base\Controller;
use App\Services\Media\Cdn\CdnProviderContract;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpFoundation\Response;

class SignMediaController extends Controller
{
    public function __invoke(Media $media, CdnProviderContract $cdn): JsonResponse
    {
        Gate::authorize('sign', $media);

        $ttl = (int) config('cdn.signature_ttl', 300);
        $path = parse_url($media->getUrl(), PHP_URL_PATH) ?: $media->getUrl();
        $url = $cdn->signUrl($path, null, $ttl);

        return $this->json([
            'url' => $url,
            'expires_at' => now()->addSeconds($ttl)->toIso8601String(),
        ], Response::HTTP_OK);
    }
}
