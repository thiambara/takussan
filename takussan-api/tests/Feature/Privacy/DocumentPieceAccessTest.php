<?php

namespace Tests\Feature\Privacy;

use App\Models\Activity;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use App\Services\Document\DocumentVersionService;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-820 (P23.04) — `GET /api/documents` ne liste plus au super-admin les pièces de toute la
 * plateforme, et la lecture d'une pièce (`id_card`, `rib`, `ninea`) par un profil plateforme qui
 * ne l'a pas téléversée laisse une trace `PersonalDataAccess`.
 */
class DocumentPieceAccessTest extends TestCase
{
    use RefreshDatabase;

    private function traces(): int
    {
        return Activity::query()
            ->where('log_name', PersonalDataAccessLogger::LOG_NAME)
            ->where('event', PersonalDataAccessLogger::EVENT)
            ->where('properties->surface', PersonalDataAccessLogger::SURFACE_DOCUMENT_PIECE)
            ->count();
    }

    private function document(User $uploader, DocumentType $type): Document
    {
        $property = Property::factory()->create(['user_id' => $uploader->id]);

        return Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $uploader->id,
            'type' => $type,
        ]);
    }

    public function test_the_index_lists_only_the_super_admin_s_own_uploads(): void
    {
        $other = User::factory()->create();
        $piece = $this->document($other, DocumentType::IdCard);
        $admin = $this->actingAsRole('super_admin');
        $own = $this->document($admin, DocumentType::IdCard);

        $ids = $this->getJson('/api/documents?filter[type]=id_card')->assertOk()->json('data.*.id');

        $this->assertContains($own->id, $ids);
        $this->assertNotContains($piece->id, $ids);
    }

    public function test_a_platform_read_of_someone_else_s_piece_is_logged_once(): void
    {
        $piece = $this->document(User::factory()->create(), DocumentType::IdCard);
        $this->actingAsRole('super_admin');

        $this->getJson("/api/documents/{$piece->id}")->assertOk();
        $this->assertSame(1, $this->traces());

        $this->getJson("/api/documents/{$piece->id}")->assertOk();
        $this->assertSame(1, $this->traces(), 'un rafraîchissement n\'est pas une seconde consultation');
    }

    public function test_a_platform_download_of_a_piece_version_is_logged(): void
    {
        $uploader = User::factory()->create();
        $piece = $this->document($uploader, DocumentType::Rib);
        $version = app(DocumentVersionService::class)
            ->uploadVersion($piece, UploadedFile::fake()->create('rib.pdf', 10, 'application/pdf'), $uploader);
        $this->actingAsRole('super_admin');

        $this->get("/api/documents/{$piece->id}/versions/{$version->id}/download")->assertRedirect();

        $this->assertSame(1, $this->traces());
    }

    public function test_no_trace_for_a_non_piece_own_upload_or_non_platform_reader(): void
    {
        $owner = User::factory()->create();
        $contract = $this->document($owner, DocumentType::LeaseContract);
        $ownPiece = $this->document($owner, DocumentType::IdCard);

        // Le téléverseur, sans profil plateforme, lit sa propre pièce.
        Sanctum::actingAs($owner);
        $this->getJson("/api/documents/{$ownPiece->id}")->assertOk();

        // Le super-admin lit un document qui n'est pas une pièce, puis une pièce qu'il a téléversée.
        $admin = $this->actingAsRole('super_admin');
        $this->getJson("/api/documents/{$contract->id}")->assertOk();
        $adminPiece = $this->document($admin, DocumentType::Ninea);
        $this->getJson("/api/documents/{$adminPiece->id}")->assertOk();

        $this->assertSame(0, $this->traces());
    }
}
