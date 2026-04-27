<?php

namespace Tests\Unit\Media;

use App\Services\Media\Cdn\CdnHealthGuard;
use App\Services\Media\Cdn\CdnProviderContract;
use App\Services\Media\MediaUrlResolver;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Mockery;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

class MediaUrlResolverTest extends TestCase
{
    private CdnProviderContract $cdn;

    private CdnHealthGuard $guard;

    protected function setUp(): void
    {
        parent::setUp();

        $this->cdn = Mockery::mock(CdnProviderContract::class);
        $this->guard = new CdnHealthGuard;

        config([
            'cdn.enabled' => true,
            'cdn.base_url' => 'https://cdn.example.com',
            'cdn.signature_ttl' => 300,
            'cdn.secure_collections' => ['lease_documents', 'contract_documents', 'property_archived_photos'],
            'cdn.health.threshold' => 3,
            'cdn.health.cooldown' => 300,
            'cdn.health.window' => 60,
        ]);

        Cache::flush();
    }

    private function makeMedia(string $collection = 'photos'): Media
    {
        $media = Mockery::mock(Media::class)->makePartial();
        $media->collection_name = $collection;

        return $media;
    }

    private function resolver(): MediaUrlResolver
    {
        return new MediaUrlResolver($this->cdn, $this->guard);
    }

    public function test_public_cdn_url_for_public_collection(): void
    {
        $media = $this->makeMedia('photos');
        $storageUrl = 'http://localhost/storage/1/photo.jpg';

        $this->cdn
            ->shouldReceive('transformUrl')
            ->once()
            ->andReturn('https://cdn.example.com/media/1/photo.jpg');

        $result = $this->resolver()->resolve($media, $storageUrl);

        $this->assertStringStartsWith('https://cdn.example.com', $result);
    }

    public function test_format_chain_with_accept_avif_header(): void
    {
        $media = $this->makeMedia('photos');
        $storageUrl = 'http://localhost/storage/1/photo.jpg';

        $this->cdn
            ->shouldReceive('transformUrl')
            ->once()
            ->with(Mockery::any(), Mockery::any(), Mockery::on(fn ($h) => isset($h['accept'])))
            ->andReturn('https://cdn.example.com/media/1/photo.jpg?format=avif');

        $result = $this->resolver()->resolve($media, $storageUrl, null, ['accept' => 'image/avif,image/webp']);

        $this->assertStringContainsString('format=avif', $result);
    }

    public function test_secure_collection_returns_signed_url(): void
    {
        $media = $this->makeMedia('lease_documents');
        $storageUrl = 'http://localhost/storage/1/lease.pdf';

        $this->cdn
            ->shouldReceive('signUrl')
            ->once()
            ->andReturn('https://cdn.example.com/media/1/lease.pdf?token=abc&expires=99999');

        $result = $this->resolver()->resolve($media, $storageUrl);

        $this->assertStringContainsString('token=', $result);
    }

    public function test_fallback_on_driver_exception(): void
    {
        $media = $this->makeMedia('photos');
        $storageUrl = 'http://localhost/storage/1/photo.jpg';

        Log::shouldReceive('warning')->once()->with('cdn.fallback_driver_exception', Mockery::any());

        $this->cdn
            ->shouldReceive('transformUrl')
            ->once()
            ->andThrow(new \RuntimeException('CDN 5xx'));

        $result = $this->resolver()->resolve($media, $storageUrl);

        $this->assertSame($storageUrl, $result);
    }

    public function test_cdn_disabled_returns_storage_url(): void
    {
        config(['cdn.enabled' => false]);

        $media = $this->makeMedia('photos');
        $storageUrl = 'http://localhost/storage/1/photo.jpg';

        $this->cdn->shouldNotReceive('transformUrl');

        $result = $this->resolver()->resolve($media, $storageUrl);

        $this->assertSame($storageUrl, $result);
    }

    public function test_fallback_when_circuit_breaker_is_open(): void
    {
        $media = $this->makeMedia('photos');
        $storageUrl = 'http://localhost/storage/1/photo.jpg';

        Cache::put(CdnHealthGuard::BREAKER_KEY, true, 300);

        Log::shouldReceive('warning')->once()->with('cdn.fallback_open_breaker', Mockery::any());

        $this->cdn->shouldNotReceive('transformUrl');

        $result = $this->resolver()->resolve($media, $storageUrl);

        $this->assertSame($storageUrl, $result);
    }
}
