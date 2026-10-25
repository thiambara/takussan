<?php

namespace Tests\Feature\Agency;

use App\Http\Requests\Api\UpdateAgencyMemberRoleRequest;
use App\Http\Requests\Api\UpdateUserRoleRequest;
use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2372 (P249.01) — les deux routes de changement de rôle n'acceptent que les rôles qu'elles
 * matérialisent : `agency_admin`, `agent` et `owner`, par une liste partagée.
 *
 * Avant : `tenant`, `customer` et `service_provider` passaient la validation, tombaient sur le
 * `default => null` des deux contrôleurs, et la réponse rendait 200 avec le rôle demandé, sans
 * qu'aucun profil change. `super_admin` finissait de même en no-op sur la route d'agence pour un
 * acteur super-administrateur.
 */
class RolesSansEffetRefusesTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $membre;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->membre = $this->agencyAgent($this->agency);
    }

    /** @return array<string, array{string}> */
    public static function rolesSansEffet(): array
    {
        return [
            'tenant' => ['tenant'],
            'customer' => ['customer'],
            'service_provider' => ['service_provider'],
            'super_admin' => ['super_admin'],
        ];
    }

    #[DataProvider('rolesSansEffet')]
    public function test_la_route_d_agence_refuse_un_role_sans_effet(string $role): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency))
            ->putJson("/api/agencies/{$this->agency->id}/members/{$this->membre->id}/role", ['role' => $role])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');

        $this->assertProfilsInchanges();
    }

    #[DataProvider('rolesSansEffet')]
    public function test_la_route_d_agence_refuse_un_role_sans_effet_meme_au_super_admin(string $role): void
    {
        $this->apiActingAsRole('super_admin');

        $this->putJson("/api/agencies/{$this->agency->id}/members/{$this->membre->id}/role", ['role' => $role])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');

        $this->assertProfilsInchanges();
    }

    #[DataProvider('rolesSansEffet')]
    public function test_la_route_du_compte_refuse_un_role_sans_effet(string $role): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency))
            ->putJson("/api/users/{$this->membre->id}/role", ['role' => $role])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');

        $this->assertProfilsInchanges();
    }

    /** Le seul administrateur, à qui l'on demandait `tenant`, recevait 422 « dernier admin » pour un geste qui ne retirait rien. */
    public function test_le_seul_administrateur_recoit_le_refus_de_validation_et_non_celui_du_dernier_admin(): void
    {
        $seulAdmin = $this->agencyAdmin($this->agency);
        $this->apiActingAsRole('super_admin');

        $this->putJson("/api/agencies/{$this->agency->id}/members/{$seulAdmin->id}/role", ['role' => 'tenant'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role')
            ->assertJsonMissing(['code' => 'agency_member.cannot_remove_last_admin']);
    }

    public function test_les_deux_requetes_partagent_la_meme_liste(): void
    {
        $this->assertSame(['agency_admin', 'agent', 'owner'], UpdateAgencyMemberRoleRequest::ALLOWED_ROLES);
        $this->assertSame(UpdateAgencyMemberRoleRequest::ALLOWED_ROLES, UpdateUserRoleRequest::ALLOWED_ROLES);
    }

    public function test_les_roles_qui_materialisent_un_profil_passent_toujours(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency))
            ->putJson("/api/agencies/{$this->agency->id}/members/{$this->membre->id}/role", ['role' => 'owner'])
            ->assertOk()
            ->assertJsonPath('data.role', 'owner');

        $this->assertTrue(OwnerProfile::query()->where('user_id', $this->membre->id)->where('agency_id', $this->agency->id)->exists());
    }

    private function assertProfilsInchanges(): void
    {
        $agencyId = $this->agency->id;
        $this->assertSame(1, AgentProfile::query()->where('user_id', $this->membre->id)->where('agency_id', $agencyId)->count());
        $this->assertSame(0, OwnerProfile::query()->where('user_id', $this->membre->id)->count());
        $this->assertSame(0, AgencyAdminProfile::query()->where('user_id', $this->membre->id)->count());
        $this->assertSame(0, PlatformProfile::query()->where('user_id', $this->membre->id)->count());
    }
}
