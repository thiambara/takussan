<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FichiersReels;

/**
 * TCK-2909 (AC2 ; ADR-0099 § 5) — le mandat de gestion signé, déposé par le personnel de l'agence sur
 * le profil du bailleur (`owner_profile:{id}`) : la fiche du bailleur le rend, le bailleur le lit dans
 * son coffre, aucune autre agence ne le voit (lecture, liste, dépôt). Les pièces KYC du profil (CNI,
 * RIB, NINEA) restent fermées au personnel par quatre portes : la fiche du document, la liste par
 * cible, le dépôt par cette route et le lien de partage public.
 */
class OwnerDocumentUploadTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private OwnerProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->landlord = User::factory()->create();
        $this->profile = OwnerProfile::factory()->create([
            'user_id' => $this->landlord->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Active,
        ]);
    }

    private function deposer(string $type = 'management_mandate', ?OwnerProfile $profile = null)
    {
        return $this->apiPost('/api/documents', [
            'documentable_type' => 'owner_profile',
            'documentable_id' => ($profile ?? $this->profile)->id,
            'name' => 'Mandat de gestion signé',
            'type' => $type,
            'file' => FichiersReels::pdf('mandat.pdf'),
        ]);
    }

    private function listeDuProfil(): array
    {
        return $this->apiGet("/api/documents?filter[documentable_type]=owner_profile&filter[documentable_id]={$this->profile->id}")
            ->assertOk()->json('data');
    }

    private function connecterLeBailleur(): void
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->landlord->fresh());
        $this->withHeader('X-Profile-Id', "owner:{$this->profile->id}");
    }

    public function test_l_agence_depose_le_mandat_que_la_fiche_et_le_bailleur_lisent(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $id = $this->deposer()->assertCreated()
            ->assertJsonPath('data.type', 'management_mandate')
            ->json('data.id');

        $this->apiGet("/api/owners/{$this->profile->id}")->assertOk()
            ->assertJsonPath('data.mandate_document.id', $id)
            ->assertJsonPath('data.mandate_document.name', 'Mandat de gestion signé')
            ->assertJsonPath('data.mandate_document.mime_type', 'application/pdf')
            ->assertJsonPath('data.mandate_document.download_path', "/api/documents/{$id}");
        $this->assertGreaterThan(0, $this->apiGet("/api/owners/{$this->profile->id}")->json('data.mandate_document.file_size'));
        $this->assertSame([$id], array_column($this->listeDuProfil(), 'id'));

        // Un agent de la même agence le lit aussi (la branche du personnel).
        $this->apiActingAsRole('agent', ['agency' => $this->agency]);
        $this->apiGet("/api/documents/{$id}")->assertOk();

        // Le bailleur : la fiche du document, et son coffre (« mes pièces »).
        $this->connecterLeBailleur();
        $this->apiGet("/api/documents/{$id}")->assertOk();
        $entries = collect($this->apiGet('/api/me/document-vault')->assertOk()->json('data.folders'))
            ->flatMap(fn (array $folder) => array_map(fn (array $e) => $e + ['folder' => $folder['key']], $folder['entries']));
        $mandat = $entries->firstWhere('document_id', $id);
        $this->assertNotNull($mandat, 'le mandat est dans le coffre du bailleur');
        $this->assertSame('pieces', $mandat['folder']);
        $this->assertSame('management_mandate', $mandat['category']);
    }

    public function test_aucune_autre_agence_ne_voit_ni_ne_depose(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $id = $this->deposer()->assertCreated()->json('data.id');

        $ailleurs = Agency::factory()->create();
        foreach (['agency_admin', 'agent'] as $role) {
            $this->apiActingAsRole($role, ['agency' => $ailleurs]);
            $this->apiGet("/api/documents/{$id}")->assertForbidden();
            $this->assertSame([], $this->listeDuProfil());
            $this->deposer()->assertNotFound();
        }

        // Un autre bailleur de la même agence non plus.
        Sanctum::actingAs(User::factory()->withOwnerProfile($this->agency)->create());
        $this->apiGet("/api/documents/{$id}")->assertForbidden();
        $this->assertSame([], $this->listeDuProfil());
        $this->deposer()->assertNotFound();

        // Le bailleur lui-même ne dépose pas sur son profil par cette route (le personnel seul).
        $this->connecterLeBailleur();
        $this->deposer()->assertNotFound();

        $this->assertSame(1, Document::query()->count());
    }

    public function test_les_pieces_kyc_du_profil_restent_fermees_au_personnel(): void
    {
        $cni = Document::factory()->create([
            'documentable_type' => OwnerProfile::class,
            'documentable_id' => $this->profile->id,
            'uploaded_by' => $this->landlord->id,
            'type' => DocumentType::IdCard,
            'name' => 'CNI',
        ]);

        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        // Porte 1 : la fiche du document.
        $this->apiGet("/api/documents/{$cni->id}")->assertForbidden();
        // Porte 2 : la liste par cible.
        $mandat = $this->deposer()->assertCreated()->json('data.id');
        $this->assertSame([$mandat], array_column($this->listeDuProfil(), 'id'));
        // Porte 3 : le dépôt d'une pièce KYC par le personnel est refusé, rien n'est créé.
        foreach (['id_card', 'rib', 'ninea'] as $type) {
            $this->deposer($type)->assertUnprocessable()->assertJsonPath('code', 'document.profile_piece_by_kyc');
        }
        $this->assertSame(2, Document::query()->count());

        // Porte 4 : le lien de partage public. Le mandat se partage, la pièce KYC non.
        $this->apiPost("/api/documents/{$cni->id}/share", [])->assertForbidden();
        $this->apiPost("/api/documents/{$mandat}/share", [])->assertCreated();

        // Le titulaire lit et liste sa pièce.
        $this->connecterLeBailleur();
        $this->apiGet("/api/documents/{$cni->id}")->assertOk();
        $this->assertEqualsCanonicalizing([$cni->id, $mandat], array_column($this->listeDuProfil(), 'id'));
    }
}
