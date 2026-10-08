<?php

namespace Tests\Feature\Uploads;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-601 — AC5b : `POST /api/documents` et `POST /api/documents/{document}/versions` ont la liste
 * de types que le front annonce (`DOCUMENT_MIME_ACCEPT`, plus `heic`) — la seconde l'affirmait dans
 * son docblock sans la vérifier.
 */
class DocumentUploadMimeTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create();
        $this->property = Property::factory()->create(['user_id' => $this->owner->id]);
        Sanctum::actingAs($this->owner);
    }

    /** @return array<string, UploadedFile> */
    private static function refused(): array
    {
        return [
            'html' => UploadedFile::fake()->create('a.html', 20, 'text/html'),
            'svg' => UploadedFile::fake()->create('a.svg', 20, 'image/svg+xml'),
            'vide' => UploadedFile::fake()->create('a.pdf', 0, 'application/pdf'),
        ];
    }

    /** @return list<UploadedFile> */
    private static function accepted(): array
    {
        return [
            UploadedFile::fake()->create('a.pdf', 100, 'application/pdf'),
            UploadedFile::fake()->create('a.docx', 100, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
            UploadedFile::fake()->create('a.heic', 100, 'image/heic'),
        ];
    }

    private function store(UploadedFile $file)
    {
        return $this->postJson('/api/documents', [
            'documentable_type' => 'property',
            'documentable_id' => $this->property->id,
            'name' => 'Pièce',
            'type' => DocumentType::Other->value,
            'file' => $file,
        ]);
    }

    public function test_le_depot_refuse_html_svg_et_vide_et_accepte_pdf_docx_heic(): void
    {
        foreach (self::refused() as $label => $file) {
            $this->store($file)->assertStatus(422)->assertJsonValidationErrors('file');
        }
        foreach (self::accepted() as $file) {
            $this->store($file)->assertCreated();
        }
    }

    public function test_une_nouvelle_version_suit_la_meme_liste(): void
    {
        $document = Document::factory()->create([
            'documentable_id' => $this->property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $this->owner->id,
        ]);

        foreach (self::refused() as $label => $file) {
            $this->postJson("/api/documents/{$document->id}/versions", ['file' => $file])
                ->assertStatus(422)
                ->assertJsonValidationErrors('file');
        }
        foreach (self::accepted() as $file) {
            $this->postJson("/api/documents/{$document->id}/versions", ['file' => $file])->assertCreated();
        }
    }
}
