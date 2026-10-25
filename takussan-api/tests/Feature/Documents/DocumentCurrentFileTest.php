<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use App\Services\Document\DocumentVersionService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-2300 (P231.02) — la version active fait foi (TCK-097). Une nouvelle version était rangée
 * dans `versions`, et les six lecteurs servaient encore `file` : le lien de partage, la page
 * publique d'un bien, `file_url` de la fiche et la revue des demandes de passage en agence
 * rendaient l'ancien fichier. Ils lisent désormais `Document::currentFile()`.
 *
 * Une nouvelle version d'un document public de bien devient publique aussitôt : c'est voulu.
 */
class DocumentCurrentFileTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        RemoteDiskFake::install('r2-private');
        $this->owner = User::factory()->create();
    }

    public function test_le_lien_de_partage_sert_la_nouvelle_version(): void
    {
        $document = $this->document(Property::factory()->create(['user_id' => $this->owner->id]));
        $link = DocumentShareLink::create([
            'document_id' => $document->id,
            'created_by_id' => $this->owner->id,
            'token' => 'jeton-'.uniqid(),
            'expires_at' => now()->addDays(7),
            'downloads_count' => 0,
        ]);

        $v2 = $this->nouvelleVersion($document);

        $this->getJson("/api/share/{$link->token}")->assertOk()->assertJsonPath('data.document.size', $v2->size);
        $this->assertSame('CONTENU-V2-PLUS-LONG', $this->get("/api/share/{$link->token}/download")->assertOk()->streamedContent());
    }

    public function test_la_fiche_du_document_rend_l_url_et_le_nom_de_la_version_active(): void
    {
        $document = $this->document(Property::factory()->create(['user_id' => $this->owner->id]));
        $v2 = $this->nouvelleVersion($document);

        $data = $this->actingAsApi($this->owner)->getJson("/api/documents/{$document->id}")->assertOk()->json('data');

        $this->assertSignedFor($data['file_url'], $v2);
        $this->assertSame('v2.pdf', $data['file_name']);
        $this->assertSame($v2->size, $data['file_size']);
    }

    public function test_la_page_publique_du_bien_sert_la_nouvelle_version_aussitot(): void
    {
        $property = Property::factory()->published()->create(['user_id' => $this->owner->id]);
        $document = $this->document($property, ['metadata' => ['public' => true]]);
        $v2 = $this->nouvelleVersion($document);

        $this->getJson("/api/public/properties/{$property->slug}")
            ->assertOk()
            ->assertJsonPath('data.documents.0.size', $v2->size);

        $location = $this->get(route('public.properties.documents.file', ['property' => $property->id, 'document' => $document->id]))
            ->assertRedirect()
            ->headers->get('Location');
        $this->assertStringStartsWith(RemoteDiskFake::PRESIGNED_HOST."/r2-private/{$v2->getPathRelativeToRoot()}?", $location);
    }

    public function test_la_revue_d_une_demande_de_passage_en_agence_sert_la_nouvelle_version(): void
    {
        $this->actingAsRole('super_admin');
        $upgradeRequest = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => Agency::factory()->create(['kind' => AgencyKind::Individual])->id,
            'submitted_by' => $this->owner->id,
        ]);
        $document = $this->document($upgradeRequest);
        $v2 = $this->nouvelleVersion($document);

        $url = $this->getJson("/api/admin/agency-upgrade-requests/{$upgradeRequest->id}")
            ->assertOk()
            ->json('data.documents.0.media_url');

        $this->assertSignedFor($url, $v2);
    }

    public function test_une_version_restauree_redevient_le_fichier_servi(): void
    {
        $document = $this->document(Property::factory()->create(['user_id' => $this->owner->id]));
        $service = app(DocumentVersionService::class);
        $v2 = $this->nouvelleVersion($document);
        $service->uploadVersion($document, UploadedFile::fake()->createWithContent('v3.pdf', 'CONTENU-V3'), $this->owner);

        $service->restoreVersion($document, $v2->id, $this->owner);

        $this->assertSame($v2->id, $document->fresh()->currentFile()?->id);
    }

    public function test_sans_version_le_fichier_d_origine_reste_servi(): void
    {
        $document = $this->document(Property::factory()->create(['user_id' => $this->owner->id]));

        $this->assertSame($document->getFirstMedia('file')->id, $document->fresh()->currentFile()?->id);
    }

    /** @param  array<string, mixed>  $attributes */
    private function document(Model $porteur, array $attributes = []): Document
    {
        $document = Document::factory()->create([
            'documentable_id' => $porteur->getKey(),
            'documentable_type' => $porteur::class,
            'uploaded_by' => $this->owner->id,
            'type' => DocumentType::Other,
            ...$attributes,
        ]);
        $document->addMedia(UploadedFile::fake()->createWithContent('v1.pdf', 'CONTENU-V1'))->toMediaCollection('file');

        return $document;
    }

    private function nouvelleVersion(Document $document): Media
    {
        return app(DocumentVersionService::class)->uploadVersion(
            $document,
            UploadedFile::fake()->createWithContent('v2.pdf', 'CONTENU-V2-PLUS-LONG'),
            $this->owner,
        );
    }

    private function assertSignedFor(mixed $url, Media $media): void
    {
        $this->assertIsString($url);
        $this->assertStringStartsWith(url("/api/media/{$media->id}/file?"), $url);
        $this->assertTrue(URL::hasValidSignature(request()->create($url), absolute: false), "URL non signée : {$url}");
    }
}
