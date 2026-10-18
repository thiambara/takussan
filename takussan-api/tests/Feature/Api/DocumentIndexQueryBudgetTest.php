<?php

namespace Tests\Feature\Api;

use App\Models\Document;
use App\Models\User;
use App\Services\Document\DocumentVersionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-901 (P20.05) — la liste des documents ne relit pas ses médias ligne par ligne.
 *
 * `DocumentResource` rend le fichier (`getFirstMedia('file')`) et la version active. La liste
 * ne chargeait pas `media`, et la version active passait par `Document::activeVersion()`, qui
 * interroge la table à chaque appel : deux requêtes `media` par ligne. Le budget se juge en
 * requêtes sur `media`, pour 2 documents puis 12, chacun avec un fichier et deux versions.
 */
class DocumentIndexQueryBudgetTest extends TestCase
{
    use RefreshDatabase;

    /** Les champs que le front demande (`DOCUMENT_LIST_FIELDS`, `lib/queries/documents.ts`). */
    private const URL = '/api/documents?fields[documents]=id,name,type,description,documentable_type,'
        .'documentable_id,is_verified,expiry_date,uploaded_by,created_at&sort=-created_at&per_page=20';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));

        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    private function documentAvecFichierEtVersions(): void
    {
        $document = Document::factory()->create(['uploaded_by' => $this->user->id]);
        $document->addMedia(UploadedFile::fake()->create('bail.pdf', 10, 'application/pdf'))
            ->toMediaCollection('file');

        $versions = app(DocumentVersionService::class);
        $versions->uploadVersion($document, UploadedFile::fake()->create('v1.pdf', 10, 'application/pdf'), $this->user);
        $versions->uploadVersion($document, UploadedFile::fake()->create('v2.pdf', 10, 'application/pdf'), $this->user);
    }

    /** @return array{0: int, 1: array<string, mixed>} les requêtes sur `media`, et la réponse */
    private function mediaQueries(string $url): array
    {
        $count = 0;
        DB::listen(function ($query) use (&$count) {
            if (preg_match('/from "media"/', $query->sql)) {
                $count++;
            }
        });
        $response = $this->getJson($url)->assertOk();
        app('events')->forget('Illuminate\Database\Events\QueryExecuted');

        return [$count, $response->json()];
    }

    public function test_la_liste_des_documents_ne_relit_pas_ses_medias_par_ligne(): void
    {
        $this->documentAvecFichierEtVersions();
        $this->documentAvecFichierEtVersions();
        [$two, $json] = $this->mediaQueries(self::URL);

        $this->assertNotNull($json['data'][0]['file_name'], 'la ligne doit rendre son fichier');
        $this->assertSame(2, $json['data'][0]['active_version']['version_number'] ?? null, 'la version active est la dernière téléversée');

        for ($i = 0; $i < 10; $i++) {
            $this->documentAvecFichierEtVersions();
        }
        [$twelve] = $this->mediaQueries(self::URL);

        $this->assertSame($two, $twelve, "{$two} requêtes media pour 2 documents, {$twelve} pour 12");
    }

    public function test_la_version_active_suit_une_restauration(): void
    {
        $this->documentAvecFichierEtVersions();
        $document = Document::query()->firstOrFail();
        $premiere = $document->getMedia('versions')->first(fn ($m) => $m->getCustomProperty('version_number') === 1);
        app(DocumentVersionService::class)->restoreVersion($document, $premiere, $this->user);

        [, $json] = $this->mediaQueries(self::URL);

        $this->assertSame(
            $document->fresh()->activeVersion()?->getCustomProperty('version_number'),
            $json['data'][0]['active_version']['version_number'] ?? null,
            'la ressource rend la version que `activeVersion()` désigne',
        );
    }
}
