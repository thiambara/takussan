<?php

namespace Tests\Feature\Validation;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
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
use PHPUnit\Framework\Attributes\DataProvider;
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

    /**
     * TCK-730 (P03.05) — `UpdatePropertyRequest` étendait `FormRequest` et autorisait tout compte
     * connecté : un intrus recevait 422 et les noms des champs `type` et `price`.
     */
    public function test_property_update_denies_before_it_validates(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $this->intrus();

        $this->putJson("/api/properties/{$property->id}", ['type' => 'chateau', 'price' => 'cher'])
            ->assertStatus(403);
        $this->patchJson("/api/properties/{$property->id}", ['type' => 'chateau', 'price' => 'cher'])
            ->assertStatus(403);
    }

    public function test_property_update_still_validates_for_an_authorized_caller(): void
    {
        $this->apiActingAsRole('super_admin');
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);

        $this->putJson("/api/properties/{$property->id}", ['type' => 'chateau', 'price' => 'cher'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['type', 'price']);
    }

    public function test_lease_termination_denies_before_it_validates(): void
    {
        $lease = Lease::factory()->create(['agency_id' => $this->agency->id]);
        $this->intrus();

        $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => ['pas', 'une', 'chaîne']])
            ->assertStatus(403);
    }

    /**
     * TCK-816 (P22.01) — les quatre voisines de `/terminate` sur le même bail, et la mise à jour
     * d'une agence, avaient un `authorize()` qui rendait `true` sec : un compte sans lien recevait
     * 422 et les noms des champs (`new_rent`, `reason`, `amount`, `effective_date`, `email`). Un
     * cas par route, puisque chacune a son propre FormRequest.
     *
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>, 3: list<string>}>
     */
    public static function routesDeBailEtDAgence(): array
    {
        return [
            'révision du loyer' => ['patch', '/api/leases/{lease}/rent', ['new_rent' => 'cher'], ['new_rent', 'reason']],
            'renouvellement' => ['post', '/api/leases/{lease}/renew', ['start_date' => 'demain', 'end_date' => 'jamais'], ['start_date', 'end_date']],
            'restitution du dépôt' => ['post', '/api/leases/{lease}/deposit-refund', ['amount' => 'tout'], ['amount']],
            'résiliation anticipée' => ['post', '/api/leases/{lease}/early-termination', ['effective_date' => 'hier'], ['effective_date']],
            'mise à jour d\'agence' => ['put', '/api/agencies/{agency}', ['email' => 'pas-une-adresse'], ['email']],
        ];
    }

    private function cheminDe(string $gabarit): string
    {
        $lease = Lease::factory()->create(['agency_id' => $this->agency->id]);

        return strtr($gabarit, ['{lease}' => (string) $lease->id, '{agency}' => (string) $this->agency->id]);
    }

    /**
     * @param  array<string, mixed>  $corps
     * @param  list<string>  $champs
     */
    #[DataProvider('routesDeBailEtDAgence')]
    public function test_lease_and_agency_writes_deny_before_they_validate(string $verbe, string $gabarit, array $corps, array $champs): void
    {
        $chemin = $this->cheminDe($gabarit);
        $this->intrus();

        $this->json(strtoupper($verbe), $chemin, $corps)
            ->assertStatus(403)
            ->assertJsonMissingPath('errors');
    }

    /**
     * @param  array<string, mixed>  $corps
     * @param  list<string>  $champs
     */
    #[DataProvider('routesDeBailEtDAgence')]
    public function test_lease_and_agency_writes_still_validate_for_an_authorized_caller(string $verbe, string $gabarit, array $corps, array $champs): void
    {
        $this->apiActingAsRole('super_admin');
        $chemin = $this->cheminDe($gabarit);

        $this->json(strtoupper($verbe), $chemin, $corps)
            ->assertStatus(422)
            ->assertJsonValidationErrors($champs);
    }

    /**
     * TCK-818 (P22.04) — quatre FormRequests portaient `return true; // Policy handles authorization`,
     * et `PropertyDuplicateRequest` rendait `$this->user() !== null` : la policy, appelée dans le
     * corps du contrôleur, venait après la validation.
     *
     * @return array<string, array{0: string, 1: array<string, mixed>, 2: list<string>}>
     */
    public static function routesAutoriseesDansLeCorps(): array
    {
        return [
            'duplication d\'un bien' => ['/api/properties/{property}/duplicate', ['title_suffix' => str_repeat('x', 60)], ['title_suffix']],
            'import d\'un relevé' => ['/api/agencies/{agency}/bank-statements', [], ['file']],
            'correspondance CSV' => ['/api/agencies/{agency}/bank-statements/csv-mapping', ['has_header' => 'peut-être'], ['has_header']],
            'rapprochement d\'une ligne' => ['/api/bank-statement-lines/{line}/match', ['payment_type' => 'inconnu'], ['payment_type', 'payment_id']],
            'délégation de rôle' => ['/api/agencies/{agency}/role-delegations', [], ['user_id', 'ends_at']],
        ];
    }

    private function cheminAutoriseDansLeCorps(string $gabarit): string
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $statement = BankStatement::factory()->create(['agency_id' => $this->agency->id]);
        $line = BankStatementLine::factory()->create(['bank_statement_id' => $statement->id]);

        return strtr($gabarit, [
            '{property}' => (string) $property->id,
            '{agency}' => (string) $this->agency->id,
            '{line}' => (string) $line->id,
        ]);
    }

    private function verbeDe(string $chemin): string
    {
        return str_ends_with($chemin, '/csv-mapping') ? 'PUT' : 'POST';
    }

    /**
     * @param  array<string, mixed>  $corps
     * @param  list<string>  $champs
     */
    #[DataProvider('routesAutoriseesDansLeCorps')]
    public function test_policy_called_in_the_body_now_denies_before_it_validates(string $gabarit, array $corps, array $champs): void
    {
        $chemin = $this->cheminAutoriseDansLeCorps($gabarit);
        $this->intrus();

        $this->json($this->verbeDe($chemin), $chemin, $corps)
            ->assertStatus(403)
            ->assertJsonMissingPath('errors');
    }

    /**
     * @param  array<string, mixed>  $corps
     * @param  list<string>  $champs
     */
    #[DataProvider('routesAutoriseesDansLeCorps')]
    public function test_policy_called_in_the_body_still_validates_for_an_authorized_caller(string $gabarit, array $corps, array $champs): void
    {
        $this->apiActingAsRole('super_admin');
        $chemin = $this->cheminAutoriseDansLeCorps($gabarit);

        $this->json($this->verbeDe($chemin), $chemin, $corps)
            ->assertStatus(422)
            ->assertJsonValidationErrors($champs);
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
