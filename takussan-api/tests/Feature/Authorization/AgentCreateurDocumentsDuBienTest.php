<?php

namespace Tests\Feature\Authorization;

use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\Support\FichiersReels;
use Tests\TestCase;

/**
 * TCK-2027 (P190.05, décision du porteur) — `DocumentPolicy::reaches` jugeait la branche du
 * bailleur par l'identité en lecture et par `landlordWrites` en écriture : l'agent qui a saisi le
 * bien (`properties.user_id`), suspendu ou retiré, lisait les documents du bien et en joignait de
 * nouveaux. Les colonnes de bailleur passent par `BailleurDuBien` (lecture) et `bailleurEcrit`
 * (écriture) ; `landlordWrites` reste pour les colonnes d'auteur.
 */
class AgentCreateurDocumentsDuBienTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    /** Un document du bien dont `user_id` désigne `$auteur`, déposé par un tiers. */
    private function documentDuBienDe(User $auteur): Document
    {
        $this->property->forceFill(['user_id' => $auteur->id])->save();

        return Document::factory()->create([
            'documentable_id' => $this->property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => User::factory()->create()->id,
        ]);
    }

    /** Un document du bail dont `landlord_id` désigne `$auteur`, déposé par un tiers. */
    private function documentDuBailDe(User $auteur): Document
    {
        $lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $auteur->id,
            'tenant_id' => Customer::factory()->create()->id,
            'status' => LeaseStatus::Active,
        ]);

        return Document::factory()->create([
            'documentable_id' => $lease->id,
            'documentable_type' => Lease::class,
            'uploaded_by' => User::factory()->create()->id,
        ]);
    }

    private function joindre(): TestResponse
    {
        return $this->postJson('/api/documents', [
            'documentable_type' => 'property',
            'documentable_id' => $this->property->id,
            'name' => 'Pièce',
            'type' => DocumentType::Other->value,
            'file' => FichiersReels::pdf(),
        ]);
    }

    private function assertPlusRien(User $agent, Document $document, Document $documentDuBail): void
    {
        Sanctum::actingAs($agent->fresh());
        $avant = Document::query()->count();

        $this->getJson("/api/documents/{$document->id}")->assertForbidden();
        $this->getJson("/api/documents/{$documentDuBail->id}")->assertForbidden();
        $this->joindre()->assertNotFound()->assertJsonPath('code', 'document.owner_not_found');
        $this->assertSame($avant, Document::query()->count());
    }

    public function test_l_agent_createur_suspendu_ne_lit_ni_ne_joint(): void
    {
        $document = $this->documentDuBienDe($this->agent);
        $documentDuBail = $this->documentDuBailDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertPlusRien($this->agent, $document, $documentDuBail);
    }

    public function test_l_agent_createur_retire_ne_lit_ni_ne_joint(): void
    {
        $document = $this->documentDuBienDe($this->agent);
        $documentDuBail = $this->documentDuBailDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertPlusRien($this->agent, $document, $documentDuBail);
    }

    /** Témoin : le bailleur du bien, bloqué, garde la lecture, plus le rattachement. */
    public function test_le_bailleur_bloque_lit_sans_joindre(): void
    {
        $document = $this->documentDuBienDe($this->landlord);
        $documentDuBail = $this->documentDuBailDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        Sanctum::actingAs($this->landlord);
        $this->getJson("/api/documents/{$document->id}")->assertOk();
        $this->getJson("/api/documents/{$documentDuBail->id}")->assertOk();
        $this->joindre()->assertNotFound()->assertJsonPath('code', 'document.owner_not_found');
    }

    /** Témoin : le bailleur actif lit et joint. */
    public function test_le_bailleur_actif_lit_et_joint(): void
    {
        $document = $this->documentDuBienDe($this->landlord);
        $documentDuBail = $this->documentDuBailDe($this->landlord);

        Sanctum::actingAs($this->landlord);
        $this->getJson("/api/documents/{$document->id}")->assertOk();
        $this->getJson("/api/documents/{$documentDuBail->id}")->assertOk();
        $this->joindre()->assertCreated();
    }

    /** Témoin : le personnel actif de l'agence lit et joint par sa propre branche. */
    public function test_l_agent_actif_lit_et_joint_au_titre_du_personnel(): void
    {
        $document = $this->documentDuBienDe($this->agent);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/documents/{$document->id}")->assertOk();
        $this->joindre()->assertCreated();
    }
}
