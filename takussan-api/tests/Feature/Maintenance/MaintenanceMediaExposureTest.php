<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC14 (P7) : les pièces écrites sont relues.
 *
 * `photos`, `completion_photos` et `quotes` étaient écrites et jamais rendues : ni la ressource ni la
 * fiche n'en exposaient une seule. Elles sortent en URL d'API signées — la seule sortie d'un fichier
 * privé —, et `quotes` reste entre le prestataire et les donneurs d'ordre.
 */
class MaintenanceMediaExposureTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
    }

    public function test_every_collection_is_exposed_with_signed_urls_that_download(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->seeded();

        Sanctum::actingAs($landlord);
        $media = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data.media');

        foreach (['photos', 'before_photos', 'completion_photos', 'quotes'] as $collection) {
            $this->assertCount(1, $media[$collection], $collection);
            $url = $media[$collection][0]['url'];
            $this->assertStringContainsString('signature=', $url);
            // Le disque de test sait émettre une URL présignée : la sortie privée y redirige (302) ;
            // un disque qui ne le sait pas sert le flux (200). Les deux « se téléchargent ».
            $this->assertContains($this->get($url)->status(), [200, 302], $collection);
        }
    }

    public function test_quotes_are_absent_for_the_tenant_requester(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->seeded();

        Sanctum::actingAs($tenant);
        $response = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();

        $response->assertJsonMissingPath('data.media.quotes');
        $this->assertCount(1, $response->json('data.media.photos'));
        $this->assertCount(1, $response->json('data.media.completion_photos'));
    }

    /** Une URL dont la signature est altérée ne sert rien. */
    public function test_tampered_signature_is_refused(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->seeded();

        Sanctum::actingAs($landlord);
        $url = $this->getJson("/api/maintenance-requests/{$mr->id}")->json('data.media.quotes.0.url');

        $this->get(preg_replace('/signature=[^&]+/', 'signature=deadbeef', $url))->assertForbidden();
    }

    /** La liste ne porte pas le bloc : il ne sert qu'à la fiche. */
    public function test_list_rows_carry_no_media_block(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->seeded();

        Sanctum::actingAs($landlord);
        $row = collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->firstWhere('id', $mr->id);

        $this->assertArrayNotHasKey('media', $row);
    }

    /** @return array<string, mixed> */
    private function seeded(): array
    {
        $scenario = $this->maintenanceScenario(MaintenanceStatus::Completed, ['accepted_at' => now()]);
        /** @var MaintenanceRequest $mr */
        $mr = $scenario['mr'];
        $mr->addMedia(UploadedFile::fake()->image('panne.jpg'))->toMediaCollection('photos');
        $mr->addMedia(UploadedFile::fake()->image('avant.jpg'))->toMediaCollection('before_photos');
        $mr->addMedia(UploadedFile::fake()->image('apres.jpg'))->toMediaCollection('completion_photos');
        $mr->addMedia(UploadedFile::fake()->create('devis.pdf', 50, 'application/pdf'))->toMediaCollection('quotes');

        return $scenario;
    }
}
