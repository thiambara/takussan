<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Property;
use App\Models\User;
use App\Services\Document\DocumentVersionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * Feature tests for TCK-097 — Document version history.
 *
 * Tests cover AC1 through AC8:
 *   AC1  POST /documents/{id}/versions creates media in `versions` collection, is_active=true
 *   AC2  Previous active version becomes is_active=false in same transaction (never 2 actives)
 *   AC3  GET  /documents/{id}/versions returns ordered list, one active
 *   AC4  POST /documents/{id}/versions/{versionId}/restore rebases without losing history
 *   AC5  Each upload/restore appears in ActivityLog with actor + version_number + comment
 *   AC6  Soft-cap: beyond 20 versions, oldest is purged from disk but still in ActivityLog
 *   AC7  (UI — not testable via feature test, skipped)
 *   AC8  User without documents.update receives 403 on upload-version and restore
 */
class DocumentVersionTest extends TestCase
{
    use RefreshDatabase;

    private DocumentVersionService $service;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');

        $this->service = app(DocumentVersionService::class);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC1 — Upload creates media in `versions`, is_active = true
    // ─────────────────────────────────────────────────────────────────────────

    public function test_upload_version_creates_media_in_versions_collection(): void
    {
        $user = User::factory()->create();
        $document = $this->makeDocument($user);

        $response = $this->actingAs($user)->postJson(
            "/api/documents/{$document->id}/versions",
            ['file' => UploadedFile::fake()->create('v1.pdf', 100, 'application/pdf')],
        );

        $response->assertStatus(201);
        $response->assertJsonPath('data.is_active', true);
        $response->assertJsonPath('data.version_number', 1);

        $document->refresh();
        $this->assertCount(1, $document->getMedia('versions'));
        $active = $document->activeVersion();
        $this->assertNotNull($active);
        $this->assertTrue((bool) $active->getCustomProperty('is_active'));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC2 — Previous active becomes is_active=false (never 2 actives at once)
    // ─────────────────────────────────────────────────────────────────────────

    public function test_previous_active_version_becomes_inactive_on_new_upload(): void
    {
        $user = User::factory()->create();
        $document = $this->makeDocument($user);

        // Upload v1.
        $this->actingAs($user)->postJson(
            "/api/documents/{$document->id}/versions",
            ['file' => UploadedFile::fake()->create('v1.pdf', 100, 'application/pdf')],
        )->assertStatus(201);

        // Upload v2.
        $this->actingAs($user)->postJson(
            "/api/documents/{$document->id}/versions",
            ['file' => UploadedFile::fake()->create('v2.pdf', 200, 'application/pdf')],
        )->assertStatus(201);

        $document->refresh();
        $all = $document->getMedia('versions');
        $this->assertCount(2, $all);

        $activeCount = $all->filter(fn ($m) => (bool) $m->getCustomProperty('is_active'))->count();
        $this->assertEquals(1, $activeCount, 'Exactly one version must be active.');

        $active = $document->activeVersion();
        $this->assertEquals(2, $active->getCustomProperty('version_number'));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC3 — GET /versions returns ordered list, one active
    // ─────────────────────────────────────────────────────────────────────────

    public function test_list_versions_returns_ordered_list_with_single_active(): void
    {
        $user = User::factory()->create();
        $document = $this->makeDocument($user);

        foreach (['v1.pdf', 'v2.pdf', 'v3.pdf'] as $name) {
            $this->service->uploadVersion($document, UploadedFile::fake()->create($name, 100, 'application/pdf'), $user);
        }

        $response = $this->actingAs($user)->getJson("/api/documents/{$document->id}/versions");
        $response->assertOk();

        $versions = $response->json('data');
        $this->assertCount(3, $versions);
        // Latest first (v3 at index 0).
        $this->assertEquals(3, $versions[0]['version_number']);
        $this->assertTrue($versions[0]['is_active']);
        $this->assertFalse($versions[1]['is_active']);
        $this->assertFalse($versions[2]['is_active']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC4 — Restore rebases without losing history
    // ─────────────────────────────────────────────────────────────────────────

    public function test_restore_version_rebases_without_losing_history(): void
    {
        $user = User::factory()->create();
        $document = $this->makeDocument($user);

        $v1 = $this->service->uploadVersion($document, UploadedFile::fake()->create('v1.pdf', 100, 'application/pdf'), $user);
        $this->service->uploadVersion($document, UploadedFile::fake()->create('v2.pdf', 200, 'application/pdf'), $user);

        $response = $this->actingAs($user)->postJson(
            "/api/documents/{$document->id}/versions/{$v1->id}/restore",
        );

        $response->assertOk();
        $response->assertJsonPath('data.version_number', 1);
        $response->assertJsonPath('data.is_active', true);

        $document->refresh();
        $this->assertCount(2, $document->getMedia('versions'), 'Both versions must still exist.');

        $active = $document->activeVersion();
        $this->assertEquals($v1->id, $active->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC5 — ActivityLog entries for upload and restore
    // ─────────────────────────────────────────────────────────────────────────

    public function test_upload_logs_activity_with_required_properties(): void
    {
        $user = User::factory()->create();
        $document = $this->makeDocument($user);

        $this->actingAs($user)->postJson(
            "/api/documents/{$document->id}/versions",
            [
                'file' => UploadedFile::fake()->create('v1.pdf', 100, 'application/pdf'),
                'comment' => 'Initial upload comment',
            ],
        )->assertStatus(201);

        $log = Activity::where('event', 'document.version.uploaded')->first();
        $this->assertNotNull($log);
        $this->assertEquals($user->id, $log->causer_id);
        $this->assertEquals($document->id, $log->subject_id);
        $this->assertEquals(1, $log->properties['version_number']);
        $this->assertEquals('Initial upload comment', $log->properties['comment']);
    }

    public function test_restore_logs_activity(): void
    {
        $user = User::factory()->create();
        $document = $this->makeDocument($user);

        $v1 = $this->service->uploadVersion($document, UploadedFile::fake()->create('v1.pdf', 100, 'application/pdf'), $user);
        $this->service->uploadVersion($document, UploadedFile::fake()->create('v2.pdf', 100, 'application/pdf'), $user);

        $this->actingAs($user)->postJson(
            "/api/documents/{$document->id}/versions/{$v1->id}/restore",
        )->assertOk();

        $log = Activity::where('event', 'document.version.restored')->first();
        $this->assertNotNull($log);
        $this->assertEquals($user->id, $log->causer_id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC6 — Soft-cap: oldest purged from disk, still traceable via ActivityLog
    // ─────────────────────────────────────────────────────────────────────────

    public function test_soft_cap_purges_oldest_version_from_disk(): void
    {
        $user = User::factory()->create();
        $document = $this->makeDocument($user);

        // Upload VERSION_CAP + 1 versions (21).
        for ($i = 1; $i <= DocumentVersionService::VERSION_CAP + 1; $i++) {
            $this->service->uploadVersion(
                $document,
                UploadedFile::fake()->create("v{$i}.pdf", 10, 'application/pdf'),
                $user,
            );
        }

        $document->refresh();
        $this->assertCount(
            DocumentVersionService::VERSION_CAP,
            $document->getMedia('versions'),
            'Oldest version must be purged from media table.'
        );

        $purgeLog = Activity::where('event', 'document.version.purged')->first();
        $this->assertNotNull($purgeLog, 'Purge event must be logged in ActivityLog.');
        $this->assertEquals(1, $purgeLog->properties['version_number'], 'Version 1 must be the purged one.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC8 — 403 for users without upload rights
    // ─────────────────────────────────────────────────────────────────────────

    public function test_unauthorized_user_gets_403_on_upload(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $document = $this->makeDocument($owner);

        $this->actingAs($stranger)->postJson(
            "/api/documents/{$document->id}/versions",
            ['file' => UploadedFile::fake()->create('v1.pdf', 100, 'application/pdf')],
        )->assertStatus(403);
    }

    public function test_unauthorized_user_gets_403_on_restore(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $document = $this->makeDocument($owner);

        $v1 = $this->service->uploadVersion($document, UploadedFile::fake()->create('v1.pdf', 100, 'application/pdf'), $owner);

        $this->actingAs($stranger)->postJson(
            "/api/documents/{$document->id}/versions/{$v1->id}/restore",
        )->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Single-active invariant — service-level unit
    // ─────────────────────────────────────────────────────────────────────────

    public function test_service_enforces_single_active_invariant(): void
    {
        $user = User::factory()->create();
        $document = $this->makeDocument($user);

        for ($i = 0; $i < 5; $i++) {
            $this->service->uploadVersion($document, UploadedFile::fake()->create("v{$i}.pdf", 10, 'application/pdf'), $user);
        }

        $all = $document->getMedia('versions');
        $activeCount = $all->filter(fn ($m) => (bool) $m->getCustomProperty('is_active'))->count();

        $this->assertEquals(1, $activeCount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private function makeDocument(User $user): Document
    {
        $property = Property::factory()->create(['user_id' => $user->id]);

        return Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
        ]);
    }
}
