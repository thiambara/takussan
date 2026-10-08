<?php

namespace Tests\Feature\Api;

use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §7, AC28, dette D-52) — le jeton d'un lien de partage n'est plus en clair en
 * base, et un lien envoyé AVANT la migration reste valide après.
 */
class DocumentShareLinkTokenStorageTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_10_08_180000_hash_document_share_links_tokens.php';

    private function document(User $owner): Document
    {
        $property = Property::factory()->create(['user_id' => $owner->id]);

        return Document::create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $owner->id,
            'name' => 'Bail signé',
            'type' => DocumentType::Other,
        ]);
    }

    public function test_a_new_link_is_stored_hashed_and_encrypted_and_still_opens(): void
    {
        $owner = User::factory()->create();
        $document = $this->document($owner);
        Sanctum::actingAs($owner);

        $token = $this->postJson("/api/documents/{$document->id}/share")->assertCreated()->json('data.token');
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $token);

        $row = DB::table('document_share_links')->sole();
        $this->assertStringNotContainsString($token, json_encode($row));
        $this->assertSame(hash('sha256', $token), $row->token_hash);
        $this->assertArrayNotHasKey('token_hash', DocumentShareLink::query()->sole()->toArray());

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/share/{$token}")->assertOk()->assertJsonPath('data.document.name', 'Bail signé');
        $this->getJson('/api/share/'.$row->token_hash)->assertNotFound();
    }

    /** Un lien UUID en clair d'avant la migration : haché et chiffré par elle, il s'ouvre encore. */
    public function test_a_link_sent_before_the_migration_still_opens_after_it(): void
    {
        $owner = User::factory()->create();
        $document = $this->document($owner);
        $migration = require database_path(self::MIGRATION);

        $migration->down();
        $legacy = Str::uuid()->toString();
        DB::table('document_share_links')->insert([
            'document_id' => $document->id,
            'token' => $legacy,
            'expires_at' => now()->addDays(7),
            'downloads_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $migration->up();

        $row = DB::table('document_share_links')->sole();
        $this->assertNotSame($legacy, $row->token);
        $this->assertSame(hash('sha256', $legacy), $row->token_hash);
        $this->getJson("/api/share/{$legacy}")->assertOk();

        // Et le retour arrière rend le jeton en clair, sans casser le lien.
        $migration->down();
        $this->assertSame($legacy, DB::table('document_share_links')->sole()->token);
        $migration->up();
    }
}
