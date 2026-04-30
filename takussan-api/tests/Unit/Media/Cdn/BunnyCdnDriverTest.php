<?php

namespace Tests\Unit\Media\Cdn;

use App\Services\Media\Cdn\BunnyCdnDriver;
use Tests\TestCase;

class BunnyCdnDriverTest extends TestCase
{
    private BunnyCdnDriver $driver;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'cdn.base_url' => 'https://cdn.example.com',
            'cdn.signing_key' => 'test-secret',
            'cdn.pull_zone' => 'takussan',
            'cdn.drivers.bunny.access_key' => 'bunny-key',
            'cdn.drivers.bunny.purge_endpoint' => 'https://api.bunny.net/purge',
        ]);

        $this->driver = new BunnyCdnDriver;
    }

    public function test_transform_url_without_conversion(): void
    {
        $url = $this->driver->transformUrl('/media/1/photo.jpg');

        $this->assertStringStartsWith('https://cdn.example.com', $url);
        $this->assertStringContainsString('/media/1/photo.jpg', $url);
    }

    public function test_transform_url_with_conversion(): void
    {
        $url = $this->driver->transformUrl('/media/1/photo.jpg', 'preview');

        $this->assertStringStartsWith('https://cdn.example.com', $url);
        $this->assertStringContainsString('preview', $url);
    }

    public function test_sign_url_produces_stable_hmac_token(): void
    {
        $url1 = $this->driver->signUrl('/media/1/lease.pdf', null, 300);
        $url2 = $this->driver->signUrl('/media/1/lease.pdf', null, 300);

        $this->assertSame($url1, $url2);
        $this->assertStringContainsString('token=', $url1);
        $this->assertStringContainsString('expires=', $url1);
    }

    public function test_format_chain_avif_hint_appends_format_param(): void
    {
        $url = $this->driver->transformUrl('/media/1/photo.jpg', null, ['accept' => 'image/avif,image/webp']);

        $this->assertStringContainsString('format=avif', $url);
    }

    public function test_format_chain_no_accept_header_uses_jpeg(): void
    {
        $url = $this->driver->transformUrl('/media/1/photo.jpg', null, []);

        $this->assertStringContainsString('format=jpeg', $url);
    }
}
