<?php

namespace Tests\Feature\Services;

use App\Services\Auth\AppleClientSecretGenerator;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use RuntimeException;
use Tests\TestCase;

class AppleClientSecretGeneratorTest extends TestCase
{
    use RefreshDatabase;

    private string $keyPath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->keyPath = base_path('tests/fixtures/apple_test_key.p8');
        $this->assertFileExists($this->keyPath, 'Throwaway EC private key fixture missing.');

        config([
            'services.apple.client_id' => 'com.takussan.test',
            'services.apple.team_id' => 'TEAM123456',
            'services.apple.key_id' => 'KEYAAAA111',
            'services.apple.private_key_path' => $this->keyPath,
        ]);
    }

    public function test_generate_produces_a_valid_es256_jwt(): void
    {
        $jwt = app(AppleClientSecretGenerator::class)->generate();

        $parts = explode('.', $jwt);
        $this->assertCount(3, $parts, 'JWT must have header.payload.signature.');

        $header = json_decode((string) base64_decode($parts[0]), true);
        $this->assertSame('ES256', $header['alg']);
        $this->assertSame('KEYAAAA111', $header['kid']);

        // Derive the public key from the private key and verify the signature
        // round-trips — proves the JWT was signed with the configured .p8.
        $pem = file_get_contents($this->keyPath);
        $privateKey = openssl_pkey_get_private($pem);
        $details = openssl_pkey_get_details($privateKey);
        $publicPem = $details['key'];

        $decoded = JWT::decode($jwt, new Key($publicPem, 'ES256'));
        $payloadArray = (array) $decoded;

        $this->assertSame('TEAM123456', $payloadArray['iss']);
        $this->assertSame('com.takussan.test', $payloadArray['sub']);
        $this->assertSame('https://appleid.apple.com', $payloadArray['aud']);
        $this->assertGreaterThan($payloadArray['iat'], $payloadArray['exp']);
    }

    public function test_generate_caches_the_jwt_for_subsequent_calls(): void
    {
        $generator = app(AppleClientSecretGenerator::class);

        $first = $generator->generate();
        $cached = Cache::get('apple_oauth_client_secret');
        $this->assertSame($first, $cached);

        // Second call returns the exact same string (no re-signing).
        $second = $generator->generate();
        $this->assertSame($first, $second);
    }

    public function test_force_refresh_invalidates_the_cache(): void
    {
        $generator = app(AppleClientSecretGenerator::class);

        $first = $generator->generate();
        // Sleep 1s so `iat` changes between signatures and tokens differ
        // even byte-for-byte.
        sleep(1);
        $refreshed = $generator->forceRefresh();

        $this->assertNotSame($first, $refreshed, 'forceRefresh must re-sign.');
        $this->assertSame($refreshed, Cache::get('apple_oauth_client_secret'));
    }

    public function test_generate_throws_when_team_id_is_missing(): void
    {
        config(['services.apple.team_id' => null]);
        Cache::forget('apple_oauth_client_secret');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('APPLE_TEAM_ID');

        app(AppleClientSecretGenerator::class)->generate();
    }

    public function test_generate_throws_when_private_key_file_is_missing(): void
    {
        config(['services.apple.private_key_path' => '/nonexistent/AuthKey_NOPE.p8']);
        Cache::forget('apple_oauth_client_secret');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('not readable');

        app(AppleClientSecretGenerator::class)->generate();
    }
}
