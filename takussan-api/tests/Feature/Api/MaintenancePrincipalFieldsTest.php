<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-445 — `assigned_to` et `priority` appartiennent au DONNEUR D'ORDRE.
 *
 * Celui qui exécute une intervention la fait avancer ; c'est le donneur d'ordre qui
 * décide à qui elle est confiée et à quel point elle est urgente.
 *
 * ⚠ Une policy qui refuserait TOUT LE MONDE cocherait « le prestataire ne peut pas ».
 * Les témoins qui doivent rester verts sont donc de première importance ici :
 * `test_agency_agent_can_change_assignment_and_priority`,
 * `test_property_owner_can_change_assignment_and_priority` et
 * `test_assigned_provider_keeps_status_and_report`. Sans eux, ce fichier serait vert
 * pour la pire des raisons.
 */
class MaintenancePrincipalFieldsTest extends TestCase
{
    use RefreshDatabase;

    /** AC1 — le prestataire assigné ne peut pas se réassigner sa demande. */
    public function test_assigned_provider_cannot_reassign_himself(): void
    {
        [$mr, $provider] = $this->scaffold();

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => User::factory()->create()->id,
        ])->assertForbidden();

        $this->assertSame($provider->id, $mr->refresh()->assigned_to);
    }

    /** AC1 — ni changer la priorité. */
    public function test_assigned_provider_cannot_change_priority(): void
    {
        [$mr, $provider] = $this->scaffold();

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'priority' => MaintenancePriority::Urgent->value,
        ])->assertForbidden();

        $this->assertSame(MaintenancePriority::Normal, $mr->refresh()->priority);
    }

    /**
     * AC1 — le refus est un 403, pas un 422 silencieux ni un champ ignoré sans le dire.
     *
     * ⚠ Ce test est le pendant du piège TCK-305 : `authorize()` court AVANT la
     * validation, donc un corps à la fois non autorisé ET mal formé doit rendre 403 —
     * sinon l'API renseigne gratuitement les contraintes de champ à qui n'a aucun droit.
     */
    public function test_refusal_is_403_even_when_the_body_is_also_invalid(): void
    {
        [$mr, $provider] = $this->scaffold();

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'priority' => 'pas-une-priorite',
        ])->assertForbidden();
    }

    /** AC2 — un agent de l'agence du bien les obtient. */
    public function test_agency_agent_can_change_assignment_and_priority(): void
    {
        $agency = Agency::factory()->create();
        [$mr] = $this->scaffold($agency);
        $newProvider = User::factory()->create();

        $this->actingAsRole('agent', ['agency' => $agency]);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $newProvider->id,
            'priority' => MaintenancePriority::Urgent->value,
        ])->assertOk()
            ->assertJsonPath('data.assigned_to', $newProvider->id)
            ->assertJsonPath('data.priority', MaintenancePriority::Urgent->value);
    }

    /** AC2 — le propriétaire du bien aussi. */
    public function test_property_owner_can_change_assignment_and_priority(): void
    {
        [$mr, , $owner] = $this->scaffold();
        $newProvider = User::factory()->create();

        Sanctum::actingAs($owner);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $newProvider->id,
            'priority' => MaintenancePriority::Low->value,
        ])->assertOk()
            ->assertJsonPath('data.assigned_to', $newProvider->id);
    }

    /**
     * AC3 — non-régression sur ce que §1.8 accorde au prestataire : faire avancer
     * le statut, déposer son rapport, planifier son passage.
     *
     * ⚠ Le rapport passe par `resolution_notes` et NON par `resolution_report` : ce
     * second champ n'a jamais eu de colonne, et le `PATCH` qui le portait rendait 500
     * (`SQLSTATE[42703] Undefined column`). Défaut relevé le 2026-08-29 en écrivant ce
     * test, hors périmètre de TCK-445 — **corrigé depuis par TCK-474**, qui a tranché le
     * retrait du champ plutôt que la création de la colonne : il est désormais
     * `prohibited` (422 qui le nomme) et absent de `$fillable`. Le contre-témoin vit
     * dans `MaintenanceResolutionReportTest`.
     */
    public function test_assigned_provider_keeps_status_and_report(): void
    {
        [$mr, $provider] = $this->scaffold();

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'status' => MaintenanceStatus::InProgress->value,
            'resolution_notes' => 'Joint remplacé, mise en eau vérifiée.',
            'scheduled_at' => now()->addDays(2)->toISOString(),
            'actual_cost' => 15000,
        ])->assertOk();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);
        $this->assertSame('Joint remplacé, mise en eau vérifiée.', $mr->resolution_notes);
    }

    /**
     * AC4 (versant `store()`) — un locataire qui crée sa demande ne choisit pas le
     * prestataire : `assigned_to` lui est retiré. Le chemin de création se protégeait
     * déjà, mais avec sa PROPRE copie de la définition du donneur d'ordre ; ce test
     * et ceux ci-dessus partagent désormais la même, et une ablation sur elle fait
     * rougir les DEUX chemins.
     */
    public function test_tenant_cannot_pick_the_provider_at_creation(): void
    {
        $tenantUser = User::factory()->create();
        $property = Property::factory()->create();
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $tenantUser->id])->id,
            'landlord_id' => $property->user_id,
            'status' => LeaseStatus::Active,
        ]);

        Sanctum::actingAs($tenantUser);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'assigned_to' => User::factory()->create()->id,
            'title' => 'Fuite robinet cuisine',
            'description' => 'Fuite continue',
            'category' => 'plumbing',
        ])->assertCreated()
            ->assertJsonPath('data.assigned_to', null);
    }

    /** AC4 (versant `store()`) — le propriétaire du bien, lui, le choisit. */
    public function test_property_owner_picks_the_provider_at_creation(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $provider = User::factory()->create();

        Sanctum::actingAs($owner);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'assigned_to' => $provider->id,
            'title' => 'Chaudière HS',
            'description' => 'Plus d\'eau chaude',
            'category' => 'plumbing',
        ])->assertCreated()
            ->assertJsonPath('data.assigned_to', $provider->id);
    }

    /**
     * AC5 — `POST .../photos` reste ouvert au DEMANDEUR sur la collection `photos` :
     * compléter son propre signalement est légitime. La décision est écrite dans
     * `docs/features.md` §1.8 et dans le docblock d'`UploadPhotosMaintenanceRequestRequest` ;
     * ce test l'épingle pour qu'un resserrement futur soit un choix et non un effet de bord.
     */
    public function test_requester_can_still_add_photos_to_his_own_report(): void
    {
        [$mr, , , $requester] = $this->scaffold();

        Sanctum::actingAs($requester);

        $this->postJson("/api/maintenance-requests/{$mr->id}/photos", [
            'photos' => [UploadedFile::fake()->image('fuite.jpg')],
        ])->assertCreated();
    }

    /**
     * @return array{0: MaintenanceRequest, 1: User, 2: User, 3: User}
     */
    private function scaffold(?Agency $agency = null): array
    {
        $owner = User::factory()->create();
        $provider = User::factory()->create();
        $requester = User::factory()->create();

        $property = Property::factory()->create(array_filter([
            'user_id' => $owner->id,
            'agency_id' => $agency?->id,
        ]));

        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $requester->id,
            'assigned_to' => $provider->id,
            'priority' => MaintenancePriority::Normal,
            'status' => MaintenanceStatus::Open,
        ]);

        return [$mr, $provider, $owner, $requester];
    }
}
