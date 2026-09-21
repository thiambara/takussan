<?php

namespace Tests\Feature\Media;

use App\Models\Document;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-545 — le fichier d'un document PUBLIÉ d'un bien sort par une URL publique
 * STABLE, autorisée par l'ÉTAT (bien public, document du bien, `metadata.public`),
 * alors que `Document.file` vit sur le disque privé (TCK-538). Éprouvé sur un
 * disque distant simulé.
 */
class MediaDiskPublicDocumentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');
    }

    public function test_a_published_document_of_a_public_property_redirects_to_a_short_presigned_url(): void
    {
        $property = Property::factory()->published()->create();
        $document = $this->documentOf($property, public: true);
        $media = $document->getFirstMedia('file');
        $this->assertSame('r2-private', $media->disk);

        $location = $this->get($this->fileUrl($property, $document))
            ->assertRedirect()
            ->headers->get('Location');

        $this->assertStringStartsWith(RemoteDiskFake::PRESIGNED_HOST."/r2-private/{$media->getPathRelativeToRoot()}?", $location);
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
        $this->assertEqualsWithDelta(now()->addMinutes(5)->getTimestamp(), (int) $query['expires'], 5);
    }

    public function test_the_public_property_page_links_the_stable_route_not_the_file(): void
    {
        $property = Property::factory()->published()->create();
        $document = $this->documentOf($property, public: true);

        $url = $this->getJson("/api/public/properties/{$property->slug}")
            ->assertOk()
            ->json('data.documents.0.url');

        // Stable : ni signature ni échéance — elle vit dans une page publique.
        $this->assertSame($this->fileUrl($property, $document), $url);
        $this->assertStringNotContainsString('signature=', $url);
    }

    public function test_an_unpublished_document_is_not_found(): void
    {
        $property = Property::factory()->published()->create();
        $document = $this->documentOf($property, public: false);

        $this->get($this->fileUrl($property, $document))->assertNotFound();
    }

    public function test_a_document_of_another_property_is_not_found(): void
    {
        $property = Property::factory()->published()->create();
        $other = Property::factory()->published()->create();
        $document = $this->documentOf($other, public: true);

        $this->get($this->fileUrl($property, $document))->assertNotFound();
    }

    public function test_a_document_of_a_property_that_is_not_public_is_not_found(): void
    {
        $property = Property::factory()->draft()->create();
        $document = $this->documentOf($property, public: true);

        $this->get($this->fileUrl($property, $document))->assertNotFound();
    }

    public function test_unchecking_public_revokes_access_at_once(): void
    {
        $property = Property::factory()->published()->create();
        $document = $this->documentOf($property, public: true);
        $url = $this->fileUrl($property, $document);
        $this->get($url)->assertRedirect();

        $document->update(['metadata' => ['public' => false]]);

        $this->get($url)->assertNotFound();
    }

    private function documentOf(Property $property, bool $public): Document
    {
        $document = Document::factory()->create([
            'documentable_type' => Property::class,
            'documentable_id' => $property->id,
            'metadata' => ['public' => $public],
        ]);
        $document->addMedia(UploadedFile::fake()->create('plan-cadastral.pdf', 20, 'application/pdf'))
            ->toMediaCollection('file');

        return $document;
    }

    private function fileUrl(Property $property, Document $document): string
    {
        return route('public.properties.documents.file', [
            'property' => $property->id,
            'document' => $document->id,
        ]);
    }
}
