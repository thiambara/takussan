<?php

namespace App\Services\Media\Cdn;

use Illuminate\Support\Facades\Http;

class BunnyCdnDriver implements CdnProviderContract
{
    public function transformUrl(string $sourcePath, ?string $conversion = null, array $hints = []): string
    {
        $base = rtrim((string) config('cdn.base_url'), '/');
        $path = $this->buildPath($sourcePath, $conversion);
        $format = $this->negotiateFormat($hints);

        return $base.$path.'?format='.$format;
    }

    public function signUrl(string $sourcePath, ?string $conversion = null, int $ttlSeconds = 300, array $hints = []): string
    {
        $base = rtrim((string) config('cdn.base_url'), '/');
        $path = $this->buildPath($sourcePath, $conversion);
        $key = (string) config('cdn.signing_key');

        $expiry = time() + $ttlSeconds;

        $token = $this->makeHmacToken($key, $path, $expiry);
        $format = $this->negotiateFormat($hints);

        return $base.$path.'?token='.$token.'&expires='.$expiry.'&format='.$format;
    }

    public function purge(array $urls): bool
    {
        $endpoint = (string) config('cdn.drivers.bunny.purge_endpoint', 'https://api.bunny.net/purge');
        $accessKey = (string) config('cdn.drivers.bunny.access_key', '');

        foreach ($urls as $url) {
            Http::withHeaders(['AccessKey' => $accessKey])
                ->get($endpoint, ['url' => $url, 'async' => true]);
        }

        return true;
    }

    public function healthCheck(): bool
    {
        $base = rtrim((string) config('cdn.base_url'), '/');

        if ($base === '') {
            return false;
        }

        try {
            $response = Http::timeout(2)->head($base);

            return $response->successful() || $response->status() < 500;
        } catch (\Throwable) {
            return false;
        }
    }

    private function buildPath(string $sourcePath, ?string $conversion): string
    {
        if ($conversion === null) {
            return '/'.ltrim($sourcePath, '/');
        }

        $dir = dirname($sourcePath);
        $file = pathinfo($sourcePath, PATHINFO_FILENAME);
        $ext = pathinfo($sourcePath, PATHINFO_EXTENSION);

        return '/'.ltrim($dir, '/').'/'.$file.'-'.$conversion.($ext !== '' ? '.'.$ext : '');
    }

    private function negotiateFormat(array $hints): string
    {
        $accept = (string) ($hints['accept'] ?? '');
        $chain = (array) config('cdn.default_format_chain', ['avif', 'webp', 'jpeg']);

        foreach ($chain as $format) {
            if (str_contains($accept, 'image/'.$format)) {
                return $format;
            }
        }

        return 'jpeg';
    }

    private function makeHmacToken(string $key, string $path, int $expiry): string
    {
        $raw = hash_hmac('sha256', $key.$path.$expiry, $key, true);

        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
