<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use App\Services\Maintenance\MaintenanceJournal;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2786 — le journal d'une intervention (`GET …/journal`) : une entrée par transition, dans
 * l'ordre, avec son acteur réduit à `{id, full_name}` ; lu par le personnel de l'agence du bien et
 * le super-admin, jamais par le bailleur, le locataire ni le prestataire ; et rien que la fiche ne
 * montre déjà — ni montant, ni motif, ni commentaire.
 */
class JournalDeLInterventionTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** AC4 — `open` jusqu'à `closed` en passant par `awaiting_owner` : chaque transition, dans l'ordre, avec son acteur. */
    public function test_ac4_une_entree_par_transition_dans_l_ordre_avec_son_acteur(): void
    {
        ['agency' => $agency, 'property' => $property, 'landlord' => $landlord, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario();
        OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->update(['works_approval_threshold' => 50000]);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($tenant);
        $id = $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Fuite sur la terrasse',
            'description' => 'L\'eau passe par la terrasse quand il pleut.',
            'category' => 'plumbing',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($agent);
        $this->patchJson("/api/maintenance-requests/{$id}", ['assigned_to' => $provider->id])->assertOk();
        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$id}/accept")->assertOk();
        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$id}/quote/request")->assertOk();
        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$id}/quote/submit", $this->quoteBody(75000))->assertOk();
        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'awaiting_owner');
        $this->postJson("/api/maintenance-requests/{$id}/owner-reminders")->assertCreated();
        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$id}/start")->assertOk();
        $this->putJson("/api/maintenance-requests/{$id}/complete", ['resolution_notes' => 'Étanchéité refaite'])->assertOk();
        Sanctum::actingAs($tenant);
        $this->postJson("/api/maintenance-requests/{$id}/confirm-resolution")->assertOk()->assertJsonPath('data.status', 'closed');

        Sanctum::actingAs($agent);
        $journal = $this->getJson("/api/maintenance-requests/{$id}/journal")
            ->assertOk()
            ->assertJsonPath('meta.starts_with_request', true)
            ->json('data');

        $this->assertSame([
            ['created', null, 'open', $tenant->id],
            // L'assignation et l'acceptation ne changent pas le statut (`from === to`) : elles ont
            // pourtant leur entrée.
            ['status.assigned', 'open', 'open', $agent->id],
            ['status.accepted', 'open', 'open', $provider->id],
            ['status.quote_requested', 'open', 'quote_requested', $agent->id],
            ['status.quote_submitted', 'quote_requested', 'quote_submitted', $provider->id],
            ['status.quote_awaiting_owner', 'quote_submitted', 'awaiting_owner', $agent->id],
            ['owner_reminded', null, null, $agent->id],
            ['status.quote_approved', 'awaiting_owner', 'approved', $landlord->id],
            ['status.transition', 'approved', 'in_progress', $provider->id],
            ['status.completed', 'in_progress', 'completed', $provider->id],
            ['status.confirmed', 'completed', 'closed', $tenant->id],
        ], array_map(fn (array $e) => [$e['code'], $e['from'], $e['to'], $e['actor']['id'] ?? null], $journal));

        // L'acteur est réduit à son identifiant et son nom.
        $this->assertSame(['id' => $agent->id, 'full_name' => $agent->full_name], $journal[1]['actor']);
        $this->assertSame(['id', 'at', 'code', 'actor', 'from', 'to'], array_keys($journal[0]));
    }

    /** AC5 — le personnel de l'agence et le super-admin lisent ; personne d'autre. */
    public function test_ac5_lecteurs_admis_et_refuses(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        ['agency' => $autre] = $this->maintenanceScenario();

        foreach (['bailleur' => $landlord, 'locataire' => $tenant, 'prestataire' => $provider, 'autre agence' => $this->agentOf($autre)] as $qui => $user) {
            Sanctum::actingAs($user);
            $this->getJson("/api/maintenance-requests/{$mr->id}/journal")->assertForbidden();
        }

        Sanctum::actingAs($this->agentOf($agency));
        $this->getJson("/api/maintenance-requests/{$mr->id}/journal")->assertOk();
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.abilities.can_view_journal', true);

        $admin = User::factory()->create();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $admin->id]);
        Sanctum::actingAs($admin);
        $this->getJson("/api/maintenance-requests/{$mr->id}/journal")->assertOk();

        Sanctum::actingAs($landlord);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.abilities.can_view_journal', false);
    }

    /** Ni le motif d'un refus, ni le commentaire d'une contestation, ni le montant d'un devis. */
    public function test_aucune_donnee_hors_fiche(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'provider' => $provider, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'MOTIF-SECRET-DU-PRESTATAIRE'])->assertOk();

        $mr->forceFill(['status' => MaintenanceStatus::Completed, 'assigned_to' => $provider->id, 'completed_at' => now()])->save();
        Sanctum::actingAs($tenant);
        $this->postJson("/api/maintenance-requests/{$mr->id}/contest-resolution", ['comment' => 'COMMENTAIRE-SECRET-DU-LOCATAIRE'])->assertOk();

        // Une ligne du log qui porterait un montant ou un motif : la ressource ne les rend pas.
        activity(MaintenanceJournal::LOG)->performedOn($mr)->causedBy($agent)->event('status.quote_submitted')
            ->withProperties(['from' => 'quote_requested', 'to' => 'quote_submitted', 'amount' => '987654', 'reason' => 'MOTIF-PLANTE'])
            ->log('status.quote_submitted');

        Sanctum::actingAs($agent);
        $reponse = $this->getJson("/api/maintenance-requests/{$mr->id}/journal")->assertOk();
        $brut = $reponse->getContent();

        foreach (['MOTIF-SECRET-DU-PRESTATAIRE', 'COMMENTAIRE-SECRET-DU-LOCATAIRE', '987654', 'MOTIF-PLANTE', 'amount', 'reason', 'comment', 'properties', 'email', 'phone'] as $fuite) {
            $this->assertStringNotContainsString($fuite, $brut, $fuite);
        }
        $this->assertContains('status.declined', array_column($reponse->json('data'), 'code'));
        $this->assertContains('status.contested', array_column($reponse->json('data'), 'code'));
    }

    /** Une demande antérieure au journal s'ouvre sur « avant le journal » ; aucune reprise. */
    public function test_une_demande_anterieure_s_ouvre_sur_avant_le_journal(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertOk();

        Sanctum::actingAs($this->agentOf($agency));
        $reponse = $this->getJson("/api/maintenance-requests/{$mr->id}/journal")
            ->assertOk()
            ->assertJsonPath('meta.starts_with_request', false)
            ->assertJsonPath('meta.total', 1);

        $this->assertSame([MaintenanceJournal::BEFORE, 'status.accepted'], array_column($reponse->json('data'), 'code'));
        $this->assertNull($reponse->json('data.0.at'));
        $this->assertNull($reponse->json('data.0.actor'));
    }

    /** Un geste du système (clôture automatique) n'a pas d'acteur. */
    public function test_le_systeme_n_a_pas_d_acteur(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()->subDays(30)]);
        $agent = $this->agentOf($agency);

        // L'utilisateur connecté n'est pas l'acteur d'un geste du système.
        Sanctum::actingAs($agent);
        app(MaintenanceRequestService::class)->transition($mr, MaintenanceStatus::Closed, null, MaintenanceStatusChanged::CAUSE_AUTO_CLOSED);

        $entree = collect($this->getJson("/api/maintenance-requests/{$mr->id}/journal")->assertOk()->json('data'))
            ->firstWhere('to', 'closed');
        $this->assertNotNull($entree);
        $this->assertNull($entree['actor']);
    }
}
