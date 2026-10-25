<?php

namespace Tests\Feature\Documents;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2300 (P231.03) — une nouvelle version remplace le fichier servi (P231.02) : elle vide la
 * vérification et l'échéance de l'ancien, par la voie de TCK-1063 (journal
 * `document_verification_reset`). L'échéance se reprend si la requête en porte une neuve.
 *
 * Une pièce de profil ne se versionne pas : vidée de sa vérification, elle redeviendrait
 * supprimable par son titulaire, ce que TCK-1062 ferme. Elle se renvoie par les assistants.
 */
class DocumentVersionVerificationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
        $this->owner = User::factory()->create();
    }

    public function test_une_nouvelle_version_vide_la_verification_et_l_echeance_et_le_journalise(): void
    {
        $verificateur = User::factory()->create();
        $verifieeLe = now()->subDay()->startOfSecond();
        $document = $this->document([
            'is_verified' => true,
            'verified_by' => $verificateur->id,
            'verified_at' => $verifieeLe,
            'expiry_date' => now()->addMonth()->toDateString(),
        ]);

        $this->versionner($document)->assertCreated();

        $document->refresh();
        $this->assertFalse($document->is_verified);
        $this->assertNull($document->verified_by);
        $this->assertNull($document->verified_at);
        $this->assertNull($document->expiry_date);

        $journal = Activity::query()
            ->where('event', 'document_verification_reset')
            ->where('subject_type', Document::class)
            ->where('subject_id', $document->id)
            ->sole();
        $this->assertSame($this->owner->id, (int) $journal->causer_id);
        $this->assertSame($verificateur->id, $journal->properties['verified_by']);
        $this->assertSame($verifieeLe->toIso8601String(), $journal->properties['verified_at']);
    }

    public function test_une_echeance_neuve_portee_par_la_version_est_reprise(): void
    {
        $profile = ServiceProviderProfile::factory()->create(['user_id' => $this->owner->id]);
        $document = $this->document([
            'documentable_type' => ServiceProviderProfile::class,
            'documentable_id' => $profile->id,
            'type' => DocumentType::Insurance,
            'expiry_date' => now()->addDays(3)->toDateString(),
        ]);
        $neuve = now()->addYear()->toDateString();

        $this->versionner($document, ['expiry_date' => $neuve])->assertCreated();

        $this->assertSame($neuve, $document->fresh()->expiry_date?->toDateString());
    }

    public function test_une_version_d_un_document_non_verifie_n_ecrit_rien_au_journal(): void
    {
        $document = $this->document();

        $this->versionner($document)->assertCreated();

        $this->assertSame(0, Activity::query()->where('event', 'document_verification_reset')->count());
    }

    public function test_une_piece_de_profil_ne_se_versionne_pas(): void
    {
        $profile = OwnerProfile::factory()->create(['user_id' => $this->owner->id]);
        $document = $this->document([
            'documentable_type' => OwnerProfile::class,
            'documentable_id' => $profile->id,
            'type' => DocumentType::Rib,
            'is_verified' => true,
            'verified_by' => User::factory()->create()->id,
            'verified_at' => now(),
        ]);

        $this->versionner($document)
            ->assertStatus(422)
            ->assertJsonPath('code', 'document.profile_piece_not_versioned');

        $document->refresh();
        $this->assertTrue($document->is_verified);
        $this->assertCount(0, $document->getMedia('versions'));
        // Toujours vérifiée, elle ne se supprime pas par son titulaire (TCK-1062).
        $this->deleteJson("/api/documents/{$document->id}")->assertForbidden();
    }

    /** @param  array<string, mixed>  $attributes */
    private function document(array $attributes = []): Document
    {
        $property = Property::factory()->create(['user_id' => $this->owner->id]);

        return Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $this->owner->id,
            'type' => DocumentType::Other,
            'is_verified' => false,
            'verified_by' => null,
            'verified_at' => null,
            ...$attributes,
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function versionner(Document $document, array $extra = [])
    {
        Sanctum::actingAs($this->owner);

        return $this->postJson("/api/documents/{$document->id}/versions", [
            'file' => UploadedFile::fake()->create('v2.pdf', 100, 'application/pdf'),
            ...$extra,
        ]);
    }
}
