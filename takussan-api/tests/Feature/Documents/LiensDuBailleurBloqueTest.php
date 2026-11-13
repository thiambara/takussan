<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Model\DocumentShareLinkService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2729 5a (décision du porteur du 2026-11-13) — le bailleur BLOQUÉ voit et révoque les liens de
 * partage publics qu'il a lui-même créés quand il était actif : un lien publié survit au blocage, et le
 * révoquer réduit l'exposition. C'est sa seule écriture : il ne crée aucun lien, ne voit ni ne révoque
 * ceux des autres, et le bailleur parti (`inactive`, ADR-0108 § 5) n'en a aucune.
 *
 * L'ability de la fiche (`abilities.manage_own_share_links`) est épinglée par `DocumentAbilitiesTest`.
 */
class LiensDuBailleurBloqueTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $bailleur;

    private Document $document;

    private DocumentShareLink $sonLien;

    private DocumentShareLink $lienDeLAgence;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agence);
        $this->bailleur = User::factory()->withOwnerProfile($this->agence)->create();
        $bien = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agence->id]);
        $bail = Lease::factory()->create(['property_id' => $bien->id, 'landlord_id' => $this->bailleur->id, 'agency_id' => $this->agence->id]);
        $this->document = Document::factory()->create(['documentable_type' => Lease::class, 'documentable_id' => $bail->id, 'uploaded_by' => $this->bailleur->id]);

        // Créés quand il était actif : le sien, puis celui de l'agence sur le même document.
        $this->actingAsApi($this->bailleur);
        $this->sonLien = DocumentShareLink::query()->findOrFail($this->postJson("/api/documents/{$this->document->id}/share", [])->assertCreated()->json('data.id'));
        $this->lienDeLAgence = app(DocumentShareLinkService::class)->create($this->document, $this->admin);

        $this->actingAsApi($this->admin);
        $this->postJson("/api/agencies/{$this->agence->id}/team/{$this->bailleur->id}/suspend")->assertOk();
        $this->assertSame(OwnerProfileStatus::Blocked, OwnerProfile::query()->where('user_id', $this->bailleur->id)->sole()->status);
        $this->actingAsApi($this->bailleur->fresh());
    }

    public function test_le_bailleur_bloque_voit_ses_seuls_liens_sans_le_jeton_des_autres(): void
    {
        $reponse = $this->getJson("/api/documents/{$this->document->id}/share-links")->assertOk();

        $this->assertSame([$this->sonLien->id], collect($reponse->json('data'))->pluck('id')->all());
        $this->assertSame(1, $reponse->json('meta.total'));
        // Le jeton du lien de l'agence (l'URL publique du document) n'est nulle part dans le corps.
        $this->assertNotSame('', (string) $this->lienDeLAgence->token);
        $this->assertStringNotContainsString((string) $this->lienDeLAgence->token, $reponse->getContent());
    }

    public function test_le_bailleur_bloque_revoque_son_lien_et_pas_celui_de_l_agence(): void
    {
        $this->deleteJson("/api/documents/{$this->document->id}/share/{$this->lienDeLAgence->id}")->assertForbidden();
        $this->assertNull($this->lienDeLAgence->fresh()->revoked_at);

        $this->deleteJson("/api/documents/{$this->document->id}/share/{$this->sonLien->id}")->assertNoContent();
        $this->assertNotNull($this->sonLien->fresh()->revoked_at);
        $this->assertSame([], $this->getJson("/api/documents/{$this->document->id}/share-links")->assertOk()->json('data'));
    }

    /** Sa seule écriture : il ne crée toujours aucun lien (TCK-587, N2). */
    public function test_le_bailleur_bloque_ne_cree_toujours_aucun_lien(): void
    {
        $this->postJson("/api/documents/{$this->document->id}/share", [])->assertForbidden();
        $this->assertSame(2, $this->document->shareLinks()->count());
    }

    /** Un lien ne se révoque que sous SON document : le sien, cité sous un autre, rend 404 après l'autorisation. */
    public function test_son_lien_cite_sous_un_autre_document_ne_se_revoque_pas(): void
    {
        $autre = Document::factory()->create(['documentable_type' => Lease::class, 'documentable_id' => $this->document->documentable_id, 'uploaded_by' => $this->bailleur->id]);

        $this->deleteJson("/api/documents/{$autre->id}/share/{$this->sonLien->id}")->assertNotFound();
        $this->assertNull($this->sonLien->fresh()->revoked_at);
    }

    /** Le bailleur parti (`inactive`) n'écrit rien (ADR-0108 § 5) : ni la liste ni la révocation. */
    public function test_le_bailleur_parti_ne_voit_ni_ne_revoque_rien(): void
    {
        OwnerProfile::query()->where('user_id', $this->bailleur->id)->update(['status' => OwnerProfileStatus::Inactive->value]);

        $this->getJson("/api/documents/{$this->document->id}/share-links")->assertForbidden();
        $this->deleteJson("/api/documents/{$this->document->id}/share/{$this->sonLien->id}")->assertForbidden();
        $this->assertNull($this->sonLien->fresh()->revoked_at);
    }

    /** Un document qu'il ne lit plus : rien, même son lien. */
    public function test_un_document_interne_ne_s_ouvre_pas_meme_a_son_createur(): void
    {
        $fiche = Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => $this->bailleur->id]);
        $interne = Document::factory()->create([
            'documentable_type' => Customer::class,
            'documentable_id' => $fiche->id,
            'uploaded_by' => $this->admin->id,
            'is_internal' => true,
        ]);
        $lien = app(DocumentShareLinkService::class)->create($interne, $this->bailleur);

        $this->getJson("/api/documents/{$interne->id}/share-links")->assertForbidden();
        $this->deleteJson("/api/documents/{$interne->id}/share/{$lien->id}")->assertForbidden();
        $this->assertNull($lien->fresh()->revoked_at);
    }

    /** Un document qu'il ne lit pas (le bail d'un autre bailleur de l'agence) : rien, même un lien à son nom. */
    public function test_un_document_qu_il_ne_lit_pas_ne_s_ouvre_pas(): void
    {
        $autreBailleur = User::factory()->withOwnerProfile($this->agence)->create();
        $autreBien = Property::factory()->create(['user_id' => $autreBailleur->id, 'agency_id' => $this->agence->id]);
        $autreBail = Lease::factory()->create(['property_id' => $autreBien->id, 'landlord_id' => $autreBailleur->id, 'agency_id' => $this->agence->id]);
        $piece = Document::factory()->create(['documentable_type' => Lease::class, 'documentable_id' => $autreBail->id, 'uploaded_by' => $this->admin->id]);
        $lien = app(DocumentShareLinkService::class)->create($piece, $this->bailleur);

        $this->getJson("/api/documents/{$piece->id}")->assertForbidden();
        $this->getJson("/api/documents/{$piece->id}/share-links")->assertForbidden();
        $this->deleteJson("/api/documents/{$piece->id}/share/{$lien->id}")->assertForbidden();
        $this->assertNull($lien->fresh()->revoked_at);
    }

    /** Témoin : réactivé, il redevient un bailleur qui partage — tous les liens, et il crée. */
    public function test_reactive_il_voit_tous_les_liens_et_partage(): void
    {
        OwnerProfile::query()->where('user_id', $this->bailleur->id)->update(['status' => OwnerProfileStatus::Active->value]);

        $this->assertEqualsCanonicalizing(
            [$this->sonLien->id, $this->lienDeLAgence->id],
            collect($this->getJson("/api/documents/{$this->document->id}/share-links")->assertOk()->json('data'))->pluck('id')->all(),
        );
        $this->postJson("/api/documents/{$this->document->id}/share", [])->assertCreated();
    }
}
