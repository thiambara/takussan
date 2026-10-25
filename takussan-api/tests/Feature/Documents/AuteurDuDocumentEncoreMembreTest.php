<?php

namespace Tests\Feature\Documents;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * P218.06 (TCK-2295) — ADR-0031, amendement du 2026-10-25 (D3) : la règle d'auteur s'applique à
 * `DocumentPolicy`. Le téléverseur (`uploaded_by` : `view`, `update`, `share`, la liste de
 * `DocumentController::index`) et les trois branches d'auteur de `reaches` (`created_by_id` d'une
 * réservation, `added_by_id` d'une fiche client, `conducted_by` d'un état des lieux) ne valent que
 * si la ligne est sans agence ou si l'auteur est encore membre de son agence ; en lecture, le
 * profil propriétaire de tout statut garde aussi (exception de l'état des lieux, B.3). La branche
 * client de réservation rend au client du tunnel public les documents de sa réservation.
 *
 * Avant (relevé par sonde) : l'agent suspendu ou retiré lisait, modifiait, partageait et listait
 * les documents qu'il avait téléversés, et lisait ceux d'une réservation, d'une fiche ou d'un état
 * des lieux qu'il avait saisis. Les témoins sont les lecteurs légitimes de la sonde.
 */
class AuteurDuDocumentEncoreMembreTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $admin;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => Customer::factory()->create()->id,
            'status' => LeaseStatus::Active,
        ]);
    }

    private function doc(Model $porteur, User $par, DocumentType $type = DocumentType::Other): Document
    {
        return Document::factory()->create([
            'documentable_id' => $porteur->getKey(),
            'documentable_type' => $porteur::class,
            'uploaded_by' => $par->id,
            'type' => $type->value,
        ]);
    }

    /** @return list<int> */
    private function listeDe(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/documents')->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return array{televerse: Document, porteurs: array<string, array{0: Model, 1: Document}>} */
    private function lignesDeLAgent(): array
    {
        $booking = Booking::factory()->create([
            'property_id' => $this->property->id,
            'customer_id' => Customer::factory()->create()->id,
            'created_by_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
        ]);
        $fiche = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);
        $edl = Inventory::factory()->create([
            'property_id' => $this->property->id,
            'lease_id' => $this->lease->id,
            'conducted_by' => $this->agent->id,
        ]);

        return [
            'televerse' => $this->doc($this->property, $this->agent),
            'porteurs' => [
                'created_by_id' => [$booking, $this->doc($booking, $this->admin)],
                'added_by_id' => [$fiche, $this->doc($fiche, $this->admin)],
                'conducted_by' => [$edl, $this->doc($edl, $this->admin)],
            ],
        ];
    }

    private function assertPlusRien(User $agent, array $lignes): void
    {
        $agent = $agent->fresh();
        $televerse = $lignes['televerse']->fresh();
        foreach (['view', 'update', 'share', 'delete'] as $ability) {
            $this->assertFalse($agent->can($ability, $televerse), "uploaded_by : {$ability}");
        }
        $this->assertNotContains($televerse->id, $this->listeDe($agent), 'uploaded_by : encore listé');

        foreach ($lignes['porteurs'] as $colonne => [$porteur, $document]) {
            $this->assertFalse($agent->can('view', $document->fresh()), "{$colonne} : view");
            $this->assertFalse($agent->can('attachTo', [Document::class, $porteur->fresh()]), "{$colonne} : attachTo");
        }

        Sanctum::actingAs($agent);
        $this->getJson("/api/documents/{$televerse->id}")->assertForbidden();
        foreach ($lignes['porteurs'] as [, $document]) {
            $this->getJson("/api/documents/{$document->id}")->assertForbidden();
        }
    }

    public function test_l_agent_suspendu_perd_ses_documents_et_ceux_de_ce_qu_il_a_saisi(): void
    {
        $lignes = $this->lignesDeLAgent();
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertPlusRien($this->agent, $lignes);
    }

    public function test_l_agent_retire_perd_ses_documents_et_ceux_de_ce_qu_il_a_saisi(): void
    {
        $lignes = $this->lignesDeLAgent();
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertPlusRien($this->agent, $lignes);
    }

    /** Témoin : l'agent actif garde tout. */
    public function test_temoin_l_agent_actif_garde_ses_documents(): void
    {
        $lignes = $this->lignesDeLAgent();
        $this->assertTrue($this->agent->can('update', $lignes['televerse']));
        $this->assertContains($lignes['televerse']->id, $this->listeDe($this->agent));
        foreach ($lignes['porteurs'] as $colonne => [, $document]) {
            $this->assertTrue($this->agent->can('view', $document), $colonne);
        }
    }

    /** Témoin : le client du tunnel public lit les documents de sa réservation par la branche client. */
    public function test_temoin_le_client_du_tunnel_garde_les_documents_de_sa_reservation(): void
    {
        $booking = $this->bookingOfClient();
        $deLAgence = $this->doc($booking, $this->admin);
        $sienne = $this->doc($booking, $this->client);

        $this->assertTrue($this->client->can('view', $deLAgence), 'document de l\'agence');
        $this->assertTrue($this->client->can('attachTo', [Document::class, $booking]), 'joindre');
        $this->assertTrue($this->client->can('update', $sienne), 'sa pièce : update');
        $this->assertContains($sienne->id, $this->listeDe($this->client));
    }

    /** Témoin : le locataire garde la pièce qu'il a jointe à son bail, gestes compris. */
    public function test_temoin_le_locataire_garde_la_piece_jointe_a_son_bail(): void
    {
        $tenant = User::factory()->create();
        $this->lease->tenant->forceFill(['user_id' => $tenant->id])->save();
        $piece = $this->doc($this->lease, $tenant);

        foreach (['view', 'update', 'share'] as $ability) {
            $this->assertTrue($tenant->can($ability, $piece->fresh()), $ability);
        }
        $this->assertContains($piece->id, $this->listeDe($tenant));
    }

    /** Témoin : le client garde la pièce qu'il a jointe à sa fiche. */
    public function test_temoin_le_client_garde_la_piece_jointe_a_sa_fiche(): void
    {
        $client = User::factory()->create();
        $fiche = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $client->id, 'added_by_id' => $this->admin->id]);
        $piece = $this->doc($fiche, $client);

        $this->assertTrue($client->can('view', $piece));
        $this->assertTrue($client->can('update', $piece));
        $this->assertContains($piece->id, $this->listeDe($client));
    }

    /** Témoin : le bailleur bloqué garde la lecture de ce qu'il a joint, et de ses pièces. */
    public function test_temoin_le_bailleur_bloque_garde_la_lecture(): void
    {
        $profil = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
        $duBien = $this->doc($this->property, $this->landlord);
        $piece = $this->doc($profil, $this->landlord, DocumentType::IdCard);
        $edl = Inventory::factory()->create([
            'property_id' => $this->property->id,
            'lease_id' => $this->lease->id,
            'conducted_by' => $this->landlord->id,
        ]);
        $deLEdl = $this->doc($edl, $this->admin);
        $profil->forceFill(['status' => OwnerProfileStatus::Blocked->value])->save();
        $bloque = $this->landlord->fresh();

        foreach (['bien' => $duBien, 'pièce' => $piece, 'état des lieux' => $deLEdl] as $nom => $document) {
            $this->assertTrue($bloque->can('view', $document->fresh()), $nom);
        }
        $this->assertFalse($bloque->can('update', $duBien->fresh()), 'le bloqué n\'écrit pas');
        $liste = $this->listeDe($bloque);
        $this->assertContains($duBien->id, $liste);
        $this->assertContains($piece->id, $liste);
    }

    /** Témoin : l'agent suspendu garde les pièces de son propre profil. */
    public function test_temoin_l_agent_suspendu_garde_les_pieces_de_son_profil(): void
    {
        $profil = AgentProfile::query()->where('user_id', $this->agent->id)->firstOrFail();
        $piece = $this->doc($profil, $this->agent, DocumentType::IdCard);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);
        $suspendu = $this->agent->fresh();

        $this->assertTrue($suspendu->can('view', $piece->fresh()));
        $this->assertTrue($suspendu->can('update', $piece->fresh()));
        $this->assertContains($piece->id, $this->listeDe($suspendu));
    }

    /** Témoin : un document sans agence (sur soi-même) reste à son auteur. */
    public function test_temoin_un_document_sans_agence_reste_a_son_auteur(): void
    {
        $lignes = $this->lignesDeLAgent();
        $surSoi = $this->doc($this->agent, $this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);
        $suspendu = $this->agent->fresh();

        $this->assertTrue($suspendu->can('view', $surSoi->fresh()));
        $this->assertTrue($suspendu->can('update', $surSoi->fresh()));
        $liste = $this->listeDe($suspendu);
        $this->assertContains($surSoi->id, $liste);
        $this->assertNotContains($lignes['televerse']->id, $liste);
    }
}
