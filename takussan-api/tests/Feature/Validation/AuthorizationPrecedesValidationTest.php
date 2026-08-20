<?php

namespace Tests\Feature\Validation;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\SavedSearch;
use App\Models\ThresholdAlert;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-305 — **l'autorisation court AVANT la validation**, et le code de réponse le prouve.
 *
 * ## Ce que ce fichier épingle, et pourquoi il n'existait pas
 *
 * TCK-305 a déplacé 120 validations en ligne vers des FormRequest. Un FormRequest valide **avant**
 * le corps du contrôleur : les **65 méthodes** qui autorisaient d'abord se sont donc mises à rendre
 * **422 au lieu de 403** quand l'appel était à la fois non autorisé et mal formé.
 *
 * Trois raisons en font un défaut et non un détail :
 *
 *   1. **hors contrat** — le ticket exige « mêmes règles, mêmes messages, mêmes codes de
 *      réponse » ; une convergence de convention qui change ce que l'API répond n'est plus une
 *      convergence ;
 *   2. **fuite d'information** — un appelant sans aucun droit recevait le détail des règles de
 *      validation de la ressource : noms de champs, contraintes, énumérations acceptées ;
 *   3. **rupture de contrat pour le front** — un client qui distingue « je n'ai pas le droit » de
 *      « ma saisie est mauvaise » affichait une erreur de formulaire au lieu d'un accès refusé.
 *
 * ⚠ **Le vrai défaut n'était pas l'inversion : c'est que RIEN ne l'observait.** 163 fichiers de
 * test assertaient 403 ou 401, tous verts, et pas un ne postait un corps invalide en même temps.
 * Un changement de code de réponse sur 65 sites qu'aucune assertion ne voit repassera à la
 * première occasion. *Une garde qui n'existe pas ne se manifeste pas par un rouge : elle se
 * manifeste par un silence qu'on prend pour un accord.*
 *
 * ## La forme de chaque test, et pourquoi elle est double
 *
 * Chaque cas envoie un corps **délibérément invalide** en tant qu'acteur **non autorisé**, et
 * exige **403**. Puis, pour la même famille, il envoie le même corps invalide en tant qu'acteur
 * **autorisé** et exige **422** — sans ce second volet, un `authorize()` qui refuserait tout le
 * monde rendrait le premier volet vert en cassant l'endpoint.
 *
 * Un test par FAMILLE de contrôleurs, pas par endpoint : les 65 sites partagent quatre mécanismes
 * (délégation à une policy, reprise d'une règle ad hoc, profil possédé, participation à une
 * conversation), et c'est le mécanisme qui régresse, pas l'endpoint.
 */
class AuthorizationPrecedesValidationTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    /** Membre d'une AUTRE agence : autorisé nulle part dans ce fichier. */
    private User $intrus;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->intrus = User::factory()->create();
        $this->materializeRoleProfile($this->intrus, 'agent', Agency::factory()->create());
    }

    private function intrus(): User
    {
        $this->actingAs($this->intrus, 'sanctum');

        return $this->intrus;
    }

    // -----------------------------------------------------------------
    // Délégation à une policy — le mécanisme des 35 sites majoritaires
    // -----------------------------------------------------------------

    public function test_property_visibility_denies_before_it_validates(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $this->intrus();

        // Corps invalide ET appelant non autorisé : c'est le refus qui doit primer.
        $this->putJson("/api/properties/{$property->id}/visibility", ['visibility' => 'semi-publique'])
            ->assertStatus(403);
    }

    public function test_property_visibility_still_validates_for_an_authorized_caller(): void
    {
        $this->apiActingAsRole('super_admin');
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);

        $this->putJson("/api/properties/{$property->id}/visibility", ['visibility' => 'semi-publique'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['visibility']);
    }

    public function test_lease_termination_denies_before_it_validates(): void
    {
        $lease = Lease::factory()->create(['agency_id' => $this->agency->id]);
        $this->intrus();

        $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => ['pas', 'une', 'chaîne']])
            ->assertStatus(403);
    }

    public function test_payout_mark_failed_denies_before_it_validates(): void
    {
        $payout = Payout::factory()->create(['agency_id' => $this->agency->id]);
        $this->intrus();

        // `failed_reason` manquant : sans le correctif, 422.
        $this->postJson("/api/payouts/{$payout->id}/mark-failed", [])
            ->assertStatus(403);
    }

    public function test_customer_pipeline_stage_denies_before_it_validates(): void
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $this->intrus();

        $this->patchJson("/api/customers/{$customer->id}/pipeline-stage", ['pipeline_stage' => 'inconnu'])
            ->assertStatus(403);
    }

    public function test_property_visit_completion_denies_before_it_validates(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $visit = PropertyVisit::factory()->create(['property_id' => $property->id]);
        $this->intrus();

        $this->postJson("/api/property-visits/{$visit->id}/complete", ['feedback' => ['x']])
            ->assertStatus(403);
    }

    public function test_inventory_room_photos_deny_before_they_validate(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $inventory = Inventory::factory()->create(['property_id' => $property->id]);
        $this->intrus();

        // Ni `photos` ni `room_name` : deux 422 certains sans le correctif.
        $this->postJson("/api/inventories/{$inventory->id}/room-photos", [])
            ->assertStatus(403);
    }

    public function test_maintenance_status_denies_before_it_validates(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $mr = MaintenanceRequest::factory()->create(['property_id' => $property->id]);
        $this->intrus();

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [])
            ->assertStatus(403);
    }

    public function test_booking_rejection_denies_before_it_validates(): void
    {
        $booking = Booking::factory()->create(['agency_id' => $this->agency->id]);
        $this->intrus();

        $this->postJson("/api/bookings/{$booking->id}/reject", ['reason' => ['x']])
            ->assertStatus(403);
    }

    public function test_guarantor_update_denies_before_it_validates(): void
    {
        $proprietaire = User::factory()->create();
        $this->materializeRoleProfile($proprietaire, 'agent', $this->agency);
        $guarantor = Guarantor::factory()->create(['added_by_id' => $proprietaire->id]);
        $this->intrus();

        $this->putJson("/api/guarantors/{$guarantor->id}", ['email' => 'pas-une-adresse'])
            ->assertStatus(403);
    }

    // -----------------------------------------------------------------
    // Reprise d'une règle ad hoc — le mécanisme des 30 sites restants
    // -----------------------------------------------------------------

    public function test_tag_creation_denies_before_it_validates(): void
    {
        // `authorizeWrite()` : super-admin exclusivement.
        $this->intrus();

        $this->postJson('/api/tags', [])->assertStatus(403);
    }

    public function test_tag_creation_still_validates_for_a_super_admin(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->postJson('/api/tags', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    public function test_saved_search_update_denies_before_it_validates(): void
    {
        $autre = User::factory()->create();
        $search = SavedSearch::factory()->create(['user_id' => $autre->id]);
        $this->intrus();

        $this->putJson("/api/saved-searches/{$search->id}", ['criteria' => 'pas-un-tableau'])
            ->assertStatus(403);
    }

    public function test_threshold_alert_update_denies_before_it_validates(): void
    {
        // Pas de factory pour ce modèle : les colonnes suffisent.
        $alert = ThresholdAlert::create([
            'agency_id' => $this->agency->id,
            'metric' => 'occupancy_rate',
            'operator' => 'lt',
            'threshold' => 50,
            'severity' => 'warning',
            'is_enabled' => true,
        ]);
        $this->intrus();

        $this->putJson("/api/threshold-alerts/{$alert->id}", ['operator' => 'inconnu'])
            ->assertStatus(403);
    }

    // -----------------------------------------------------------------
    // Profil possédé — `assertOwner()`, six sites
    // -----------------------------------------------------------------

    public function test_service_provider_trades_deny_before_they_validate(): void
    {
        $autre = User::factory()->create();
        $profile = ServiceProviderProfile::factory()->create(['user_id' => $autre->id]);
        $this->intrus();

        $this->patchJson("/api/me/profiles/{$profile->id}/trades", ['hourly_rate' => -1])
            ->assertStatus(403);
    }

    public function test_service_provider_trades_still_validate_for_the_owner(): void
    {
        $moi = $this->apiActingAsRole('agent');
        $profile = ServiceProviderProfile::factory()->create(['user_id' => $moi->id]);

        $this->patchJson("/api/me/profiles/{$profile->id}/trades", ['hourly_rate' => -1])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['hourly_rate']);
    }

    // -----------------------------------------------------------------
    // Participation à une conversation — `ensureParticipant()`, quatre sites
    // -----------------------------------------------------------------

    public function test_conversation_mute_denies_before_it_validates(): void
    {
        $conversation = Conversation::factory()->create();
        $this->intrus();

        $this->putJson("/api/conversations/{$conversation->id}/mute", ['is_muted' => 'peut-être'])
            ->assertStatus(403);
    }

    public function test_conversation_mute_still_validates_for_a_participant(): void
    {
        $membre = $this->apiActingAsRole('agent');
        $conversation = Conversation::factory()->create();
        $conversation->participants()->attach($membre->id, ['role' => 'member']);

        $this->putJson("/api/conversations/{$conversation->id}/mute", ['is_muted' => 'peut-être'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_muted']);
    }
}
