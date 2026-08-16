<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-279 — `properties.moderate` et `reports.view_global` sont réservées à
 * la PLATEFORME. La revue de la PR #176 a mesuré que l'invariant était écrit
 * dans trois docblocks et appliqué nulle part à l'écriture :
 *
 *   1. `POST /agencies/{a}/roles`            → rôle personnalisé (roles.create_custom)
 *   2. `PUT  .../roles/{r}/capabilities`     → la validation acceptait TOUT cas de l'enum
 *   3. `PATCH /profiles/{p}/agency-role`     → réaffectation de son propre profil
 *   → `canActAt(PropertiesModerate, $agency)` rendait `true`.
 *
 * Les trois opérations sont couvertes par les capacités que le rôle système
 * `agency_admin` accorde déjà : l'escalade ne demandait aucun droit qu'un
 * administrateur d'agence n'ait pas. Elle était latente — aucun site d'appel
 * de production ne lit encore ces deux capacités — et c'est précisément
 * pourquoi elle se ferme maintenant.
 *
 * Ces tests échouent sur le code d'avant le correctif : vérifié par ablation.
 */
class PlatformReservedCapabilityTest extends TestCase
{
    use RefreshDatabase;

    private function agencyAdmin(Agency $agency): User
    {
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);

        return $user;
    }

    public function test_an_agency_admin_cannot_grant_a_platform_capability_to_a_custom_role(): void
    {
        $agency = Agency::factory()->create();
        $user = $this->agencyAdmin($agency);
        Sanctum::actingAs($user);

        $role = $this->postJson("/api/agencies/{$agency->id}/roles", [
            'name' => 'Rôle élargi',
            'base_profile_type' => 'agency_admin',
        ])->assertStatus(201)->json('data.id');

        $this->putJson("/api/agencies/{$agency->id}/roles/{$role}/capabilities", [
            'capabilities' => ['team.assign_role', 'properties.moderate'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['capabilities.1']);

        $this->putJson("/api/agencies/{$agency->id}/roles/{$role}/capabilities", [
            'capabilities' => ['reports.view_global'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['capabilities.0']);

        // Et rien n'a été écrit : un 422 qui laisse une ligne derrière lui
        // serait pire qu'une absence de garde.
        $this->assertDatabaseMissing('agency_role_capabilities', [
            'agency_role_id' => $role,
            'capability' => 'properties.moderate',
        ]);
        $this->assertFalse($user->fresh()->canActAt(Capability::PropertiesModerate, $agency));
    }

    public function test_the_ordinary_capabilities_of_the_same_call_still_pass(): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs($this->agencyAdmin($agency));

        $role = $this->postJson("/api/agencies/{$agency->id}/roles", [
            'name' => 'Rôle ordinaire',
            'base_profile_type' => 'agent',
        ])->assertStatus(201)->json('data.id');

        $this->putJson("/api/agencies/{$agency->id}/roles/{$role}/capabilities", [
            'capabilities' => ['team.assign_role', 'properties.create'],
        ])->assertStatus(200);

        $this->assertDatabaseHas('agency_role_capabilities', [
            'agency_role_id' => $role,
            'capability' => 'properties.create',
        ]);
    }

    /**
     * Le backstop du service, atteint par le clonage et par tout appel
     * interne — pas seulement par la requête HTTP.
     */
    public function test_the_service_refuses_a_reserved_capability_whatever_the_caller(): void
    {
        $agency = Agency::factory()->create();
        $role = AgencyRole::query()->create([
            'agency_id' => $agency->id,
            'name' => 'Direct',
            'base_profile_type' => 'agent',
            'is_system' => false,
            'is_clonable' => true,
        ]);

        $this->expectException(ValidationException::class);

        app(AgencyRoleService::class)->replaceCapabilities($role, [
            Capability::PropertiesCreate,
            Capability::ReportsViewGlobal,
        ]);
    }

    /**
     * Le seed des rôles système n'a jamais accordé ces deux capacités ; il
     * lit désormais la MÊME source que la garde d'écriture, et ce test tient
     * l'accord entre les deux.
     */
    public function test_no_seeded_system_role_carries_a_reserved_capability(): void
    {
        Agency::factory()->count(2)->create();

        $this->assertSame(
            [],
            AgencyRoleCapability::query()
                ->whereIn('capability', array_map(
                    static fn (Capability $c): string => $c->value,
                    Capability::platformReserved(),
                ))
                ->pluck('capability')
                ->all(),
        );
    }

    public function test_the_catalogue_names_the_reserved_capabilities_so_the_ui_can_grey_them(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/capabilities')
            ->assertStatus(200)
            ->assertJsonPath('data.platform_reserved', [
                'properties.moderate',
                'reports.view_global',
            ]);
    }
}
