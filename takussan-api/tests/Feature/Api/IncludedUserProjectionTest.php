<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-693 (piste P21.01) — le `User` chargé par `include=user` sort par une projection FIXE :
 * id, noms, e-mail, téléphone, avatar. Avant, les quatre listes ci-dessous rendaient la ligne
 * `users` entière (38 clés, `google_id`, `metadata` et le second numéro compris), `$hidden` seul
 * filtrant.
 */
class IncludedUserProjectionTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const PROJECTION = ['avatar_url', 'email', 'first_name', 'full_name', 'id', 'last_name', 'phone'];

    public function test_owners_include_user_rend_la_projection_fixe(): void
    {
        [$agency, , $agent] = $this->agence();
        $bailleur = $this->compteSensible();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($agent);
        $this->assertProjection(
            $this->getJson('/api/owners?include=user&per_page=100')->assertOk()->json('data'),
            $bailleur,
        );
    }

    public function test_team_include_user_rend_la_projection_fixe(): void
    {
        [$agency, $admin] = $this->agence();
        $collegue = $this->compteSensible();
        AgentProfile::factory()->create(['user_id' => $collegue->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);
        $data = $this->getJson("/api/agencies/{$agency->id}/team?include=user")->assertOk()->json('data');
        $this->assertProjection($data, $collegue);

        // La colonne 2FA calculée de l'équipe (TCK-589) reste sur le profil.
        $ligne = collect($data)->firstWhere('user_id', $collegue->id);
        $this->assertArrayHasKey('two_factor_enabled', $ligne);
    }

    public function test_service_providers_include_user_rend_la_projection_fixe(): void
    {
        [$agency, , $agent] = $this->agence();
        $prestataire = $this->providerFor($agency, userAttributes: $this->attributsSensibles());

        Sanctum::actingAs($agent);
        $this->assertProjection(
            $this->getJson("/api/agencies/{$agency->id}/service-providers?include=user")->assertOk()->json('data'),
            $prestataire,
        );
    }

    public function test_tenant_onboarding_pending_include_user_rend_la_projection_fixe(): void
    {
        [$agency, , $agent] = $this->agence();
        $locataire = $this->compteSensible();
        $lease = Lease::factory()->active()->create([
            'tenant_id' => Customer::factory()->create(['user_id' => $locataire->id])->id,
            'agency_id' => $agency->id,
        ]);
        $checklist = TenantOnboardingChecklist::create(['lease_id' => $lease->id, 'user_id' => $locataire->id]);
        $checklist->forceFill(['created_at' => now()->subDays(10)])->save();

        Sanctum::actingAs($agent);
        $response = $this->getJson("/api/agencies/{$agency->id}/tenant-onboarding-pending?include=user")->assertOk();
        $this->assertProjection($response->json('data'), $locataire);
        // TCK-904 (P21.06) — l'enveloppe canonique (TCK-304), plus le paginateur Laravel brut.
        $this->assertNotNull($response->json('meta.current_page'));
        $this->assertNull($response->json('current_page'));
    }

    public function test_fields_users_restreint_la_projection_sans_jamais_l_elargir(): void
    {
        [$agency, , $agent] = $this->agence();
        $bailleur = $this->compteSensible();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($agent);
        $data = $this->getJson('/api/owners?include=user&fields[users]=id,first_name,last_name,email&per_page=100')
            ->assertOk()->json('data');
        $user = collect($data)->firstWhere('user_id', $bailleur->id)['user'];

        $this->assertSame(['avatar_url', 'email', 'first_name', 'full_name', 'id', 'last_name'], $this->cles($user));
        $this->assertSame('Awa', $user['first_name']);
    }

    /** @param  list<array<string, mixed>>  $data */
    private function assertProjection(array $data, User $compte): void
    {
        $ligne = collect($data)->firstWhere('user_id', $compte->id);
        $this->assertNotNull($ligne, "le compte {$compte->id} manque à la liste");

        $user = $ligne['user'];
        $this->assertSame(self::PROJECTION, $this->cles($user));
        $this->assertSame($compte->id, $user['id']);
        $this->assertSame('Awa Ndiaye', $user['full_name']);
        $this->assertSame('+221770000001', $user['phone']);
        $this->assertSame($compte->email, $user['email']);
    }

    /** @return list<string> */
    private function cles(array $user): array
    {
        $cles = array_keys($user);
        sort($cles);

        return $cles;
    }

    private function compteSensible(): User
    {
        return User::factory()->create($this->attributsSensibles());
    }

    /** @return array<string, mixed> */
    private function attributsSensibles(): array
    {
        return [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'phone' => '+221770000001',
            'google_id' => 'google-123',
            'metadata' => ['note' => 'interne'],
            'last_login_at' => now(),
        ];
    }

    /** @return array{Agency, User, User} */
    private function agence(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $agent = User::factory()->withAgentProfile($agency)->create();

        return [$agency, $admin, $agent];
    }
}
