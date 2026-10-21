<?php

namespace Tests\Feature\Http\Proxies;

use App\Models\Document;
use App\Models\Property;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * TCK-1058 (P73.01) — l'origine des URL que l'API rend est celle d'`APP_URL`, jamais celle de la
 * requête.
 *
 * Le serveur Next joint l'API par son adresse interne (`API_INTERNAL_URL`, ADR-0052 § 5). Depuis
 * TCK-853, `X-Forwarded-Host` n'est plus cru : l'hôte de la requête est l'hôte interne, et toute URL
 * fabriquée depuis elle (`route()`, une route signée) le portait jusqu'au navigateur. La signature
 * porte sur cet hôte : on ne peut pas réécrire l'URL après coup.
 *
 * Chaque test rejoue exactement ce que le front envoie sur le chemin interne : l'hôte interne, et
 * les trois `X-Forwarded-*` tirés de l'origine publique, depuis un mandataire de confiance.
 */
class RacineDesUrlTest extends TestCase
{
    use RefreshDatabase;

    private const HOTE_INTERNE = 'http://api-interne:8080';

    public function test_le_lien_d_un_document_publie_porte_l_origine_d_app_url(): void
    {
        $property = Property::factory()->published()->create();
        $this->documentDe($property);

        $url = $this->commeLeFront()
            ->getJson(self::HOTE_INTERNE."/api/public/properties/{$property->slug}")
            ->assertOk()
            ->json('data.documents.0.url');

        $this->assertStringStartsWith($this->origine().'/api/public/', (string) $url);
        $this->assertStringNotContainsString('api-interne', (string) $url);
    }

    public function test_une_url_signee_porte_l_origine_d_app_url_et_reste_acceptee(): void
    {
        $property = Property::factory()->published()->create();
        $media = $this->documentDe($property)->getFirstMedia('file');
        Route::get('/_test/url-signee', fn () => ['url' => app(PrivateMediaAccess::class)->signedUrl($media)]);

        $url = (string) $this->commeLeFront()
            ->getJson(self::HOTE_INTERNE.'/_test/url-signee')
            ->assertOk()
            ->json('url');

        $this->assertStringStartsWith($this->origine().'/api/media/', $url);
        $this->assertStringNotContainsString('api-interne', $url);
        // Le navigateur la présente à l'origine publique : `signed` l'accepte (403 sinon), et la
        // route renvoie vers une URL présignée du disque.
        $this->flushHeaders();
        $this->get($url)->assertRedirect();
    }

    private function commeLeFront(): static
    {
        $publique = parse_url('https://api-publique.example');

        return $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->withHeaders([
                'X-Forwarded-For' => '203.0.113.9',
                'X-Forwarded-Host' => $publique['host'],
                'X-Forwarded-Proto' => 'https',
                'X-Forwarded-Port' => '443',
            ]);
    }

    private function origine(): string
    {
        return rtrim((string) config('app.url'), '/');
    }

    private function documentDe(Property $property): Document
    {
        $document = Document::factory()->create([
            'documentable_type' => Property::class,
            'documentable_id' => $property->id,
            'metadata' => ['public' => true],
        ]);
        $document->addMedia(UploadedFile::fake()->create('plan.pdf', 20, 'application/pdf'))
            ->toMediaCollection('file');

        return $document;
    }
}
