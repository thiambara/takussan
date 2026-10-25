<?php

namespace Tests\Feature\Maintenance;

use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Policies\MaintenanceRequestPolicy;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Messaging\GroupConversationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * P248.01 (TCK-2374) — ADR-0031, amendement du 2026-10-25 : le demandeur dont le bail a pris
 * fin garde la LECTURE de ses interventions, comme celle de son bail passé ; confirmer, contester,
 * ajouter des photos et écrire dans le fil exigent un bail en cours du bien
 * (`User::ACTIVE_TENANT_LEASE_STATUSES`, la liste de `store`).
 *
 * Avant : bail `terminated`, nouveau locataire arrivé, l'ancien locataire confirmait la réparation
 * (200, la demande passait `closed`), ajoutait des photos (201) et écrivait dans le fil.
 */
class DemandeurAuBailFiniTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private Property $property;

    private User $landlord;

    private User $tenant;

    private User $provider;

    private MaintenanceRequest $completed;

    private MaintenanceRequest $inProgress;

    private Conversation $thread;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');

        [
            'property' => $this->property, 'landlord' => $this->landlord, 'tenant' => $this->tenant,
            'provider' => $this->provider, 'mr' => $this->completed,
        ] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()]);

        $lease = Lease::query()->where('property_id', $this->property->id)->sole();
        $this->completed->update(['lease_id' => $lease->id]);
        $this->inProgress = MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'lease_id' => $lease->id,
            'requester_id' => $this->tenant->id,
            'assigned_to' => $this->provider->id,
            'status' => MaintenanceStatus::InProgress,
        ]);
        $this->thread = app(GroupConversationService::class)->create(
            $this->landlord,
            $this->inProgress->title,
            [$this->provider->id, $this->tenant->id],
            $this->property->id,
            $lease->id,
            $this->inProgress->id,
            sendInvites: false,
        );
    }

    private function finDuBail(): void
    {
        Lease::query()->where('property_id', $this->property->id)->update(['status' => LeaseStatus::Terminated]);
        // L'occupant suivant, au bail actif.
        $this->tenantOf($this->property);
    }

    public function test_l_ancien_locataire_garde_la_lecture_de_ses_interventions_et_de_leur_fil(): void
    {
        $this->finDuBail();
        Sanctum::actingAs($this->tenant->fresh());

        $this->getJson("/api/maintenance-requests/{$this->completed->id}")->assertOk();
        $ids = collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$this->completed->id, $this->inProgress->id], $ids);
        $this->getJson("/api/conversations/{$this->thread->id}")->assertOk();
        $this->getJson("/api/conversations/{$this->thread->id}/messages")->assertOk();
    }

    public function test_l_ancien_locataire_ne_confirme_ni_ne_conteste_plus_la_reparation(): void
    {
        $this->finDuBail();
        $tenant = $this->tenant->fresh();

        $this->assertFalse($tenant->can('respondToResolution', [$this->completed->fresh(), MaintenanceStatus::Closed]));
        $this->assertNotContains(
            MaintenanceStateMachine::ACTOR_REQUESTER,
            app(MaintenanceRequestPolicy::class)->actorsOf($tenant, $this->completed->fresh()),
        );

        Sanctum::actingAs($tenant);
        $show = $this->getJson("/api/maintenance-requests/{$this->completed->id}")->assertOk();
        $show->assertJsonPath('data.abilities.can_confirm_resolution', false)
            ->assertJsonPath('data.abilities.can_contest_resolution', false);

        $this->postJson("/api/maintenance-requests/{$this->completed->id}/confirm-resolution")->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$this->completed->id}/contest-resolution", ['comment' => 'Encore une fuite'])
            ->assertForbidden();
        $this->assertSame(MaintenanceStatus::Completed, $this->completed->fresh()->status);
    }

    public function test_l_ancien_locataire_n_ajoute_plus_de_photos(): void
    {
        $this->finDuBail();
        Sanctum::actingAs($this->tenant->fresh());

        $this->postJson("/api/maintenance-requests/{$this->inProgress->id}/photos", [
            'photos' => [UploadedFile::fake()->image('fuite.jpg')],
        ])->assertForbidden();
        $this->assertSame(0, $this->inProgress->fresh()->getMedia('photos')->count());
    }

    public function test_l_ancien_locataire_n_ecrit_plus_dans_le_fil_de_l_intervention(): void
    {
        $this->finDuBail();
        Sanctum::actingAs($this->tenant->fresh());

        $this->getJson("/api/conversations/{$this->thread->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.can_send_message', false);
        $this->postJson("/api/conversations/{$this->thread->id}/messages", ['content' => 'Toujours là ?'])
            ->assertForbidden();
    }

    /** Témoin : au bail actif, tout reste ouvert. */
    public function test_temoin_le_locataire_au_bail_actif_garde_les_gestes(): void
    {
        Sanctum::actingAs($this->tenant);

        $this->getJson("/api/conversations/{$this->thread->id}")->assertJsonPath('data.abilities.can_send_message', true);
        $this->postJson("/api/conversations/{$this->thread->id}/messages", ['content' => 'Merci'])->assertCreated();
        $this->postJson("/api/maintenance-requests/{$this->inProgress->id}/photos", [
            'photos' => [UploadedFile::fake()->image('fuite.jpg')],
        ])->assertCreated();
        $this->postJson("/api/maintenance-requests/{$this->completed->id}/confirm-resolution")
            ->assertOk()->assertJsonPath('data.status', 'closed');
    }

    /** Témoin : en préavis (`terminating`), il habite encore le logement — la liste de `store`. */
    public function test_temoin_le_locataire_en_preavis_garde_les_gestes(): void
    {
        Lease::query()->where('property_id', $this->property->id)->update(['status' => LeaseStatus::Terminating]);
        Sanctum::actingAs($this->tenant->fresh());

        $this->postJson("/api/maintenance-requests/{$this->completed->id}/confirm-resolution")->assertOk();
    }

    /** Témoin : renouvelé, le bail suivant du même bien est en cours. */
    public function test_temoin_le_locataire_renouvele_garde_les_gestes(): void
    {
        Lease::query()->where('property_id', $this->property->id)->update(['status' => LeaseStatus::Renewed]);
        $customer = Customer::query()->where('user_id', $this->tenant->id)->sole();
        Lease::factory()->create([
            'property_id' => $this->property->id,
            'tenant_id' => $customer->id,
            'landlord_id' => $this->landlord->id,
            'status' => LeaseStatus::Active,
        ]);
        Sanctum::actingAs($this->tenant->fresh());

        $this->postJson("/api/conversations/{$this->thread->id}/messages", ['content' => 'Merci'])->assertCreated();
        $this->postJson("/api/maintenance-requests/{$this->completed->id}/confirm-resolution")->assertOk();
    }

    /** Témoin : un demandeur qui n'a jamais été locataire du bien n'est pas visé. */
    public function test_temoin_le_demandeur_jamais_locataire_du_bien_garde_les_gestes(): void
    {
        $demandeur = User::factory()->create();
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'requester_id' => $demandeur->id,
            'status' => MaintenanceStatus::Completed,
            'completed_at' => now(),
        ]);
        $this->finDuBail();
        Sanctum::actingAs($demandeur);

        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertOk();
    }

    /** Témoin : le bailleur et le prestataire ne dépendent d'aucun bail. */
    public function test_temoin_le_bailleur_et_le_prestataire_ecrivent_toujours(): void
    {
        $this->finDuBail();

        foreach ([$this->landlord, $this->provider] as $user) {
            Sanctum::actingAs($user);
            $this->postJson("/api/conversations/{$this->thread->id}/messages", ['content' => 'Noté'])->assertCreated();
        }

        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/maintenance-requests/{$this->completed->id}/confirm-resolution")->assertOk();
    }
}
