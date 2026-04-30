<?php

namespace Tests\Unit\Media\Cdn;

use App\Services\Media\Cdn\CloudflareCdnDriver;
use RuntimeException;
use Tests\TestCase;

class CloudflareCdnDriverTest extends TestCase
{
    private CloudflareCdnDriver $driver;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'cdn.base_url' => 'https://cf.example.com',
        ]);

        $this->driver = new CloudflareCdnDriver;
    }

    public function test_transform_url_returns_cdn_url(): void
    {
        $url = $this->driver->transformUrl('/media/1/photo.jpg');

        $this->assertStringStartsWith('https://cf.example.com', $url);
    }

    public function test_sign_url_throws_runtime_exception(): void
    {
        $this->expectException(RuntimeException::class);

        $this->driver->signUrl('/media/1/lease.pdf', null, 300);
    }

    public function test_purge_throws_runtime_exception(): void
    {
        $this->expectException(RuntimeException::class);

        $this->driver->purge(['https://cf.example.com/media/1/photo.jpg']);
    }
}
