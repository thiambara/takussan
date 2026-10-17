<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-791 (piste P21.02) — `GET /api/users` sans `fields[users]` rend la projection par défaut
 * de P21.01 (id, noms, e-mail, téléphone, avatar), plus la colonne 2FA calculée. Avant, il rendait
 * les modèles `User` bruts : 38 clés, `google_id`, `metadata` et le second numéro compris.
 * `google_id` et `metadata` ne sortent jamais, `fields[users]` compris.
 */
class UserAdminDefaultProjectionTest extends TestCase
{
    use RefreshDatabase;

    private const PROJECTION = ['avatar_url', 'email', 'first_name', 'full_name', 'id', 'last_name', 'phone', 'two_factor_enabled'];

    public function test_sans_fields_la_liste_rend_la_projection_par_defaut(): void
    {
        [$admin, $membre] = $this->equipe();

        Sanctum::actingAs($admin);
        $ligne = $this->ligne($this->getJson('/api/users?per_page=100')->assertOk()->json('data'), $membre);

        $cles = array_keys($ligne);
        sort($cles);
        $this->assertSame(self::PROJECTION, $cles);
        $this->assertSame('Awa Ndiaye', $ligne['full_name']);
    }

    public function test_les_relations_demandees_restent_rendues(): void
    {
        [$admin, $membre] = $this->equipe();

        Sanctum::actingAs($admin);
        $ligne = $this->ligne($this->getJson('/api/users?include=agencyAdminProfiles&per_page=100')->assertOk()->json('data'), $membre);

        $this->assertArrayHasKey('agency_admin_profiles', $ligne);
        $this->assertArrayNotHasKey('google_id', $ligne);
        $this->assertArrayNotHasKey('metadata', $ligne);
    }

    public function test_avec_fields_la_projection_demandee_est_rendue_et_google_id_reste_refuse(): void
    {
        [$admin, $membre] = $this->equipe();

        Sanctum::actingAs($admin);
        $ligne = $this->ligne($this->getJson('/api/users?fields[users]=id,first_name,status&per_page=100')->assertOk()->json('data'), $membre);
        $cles = array_keys($ligne);
        sort($cles);
        $this->assertSame(['first_name', 'id', 'status', 'two_factor_enabled'], $cles);

        $this->getJson('/api/users?fields[users]=id,google_id')->assertStatus(400);
        $this->getJson('/api/users?fields[users]=id,metadata')->assertStatus(400);
    }

    /** @return array{User, User} */
    private function equipe(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $membre = User::factory()->withAgentProfile($agency)->create([
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'phone' => '+221770000001',
            'google_id' => 'google-123',
            'metadata' => ['note' => 'interne'],
            'last_login_at' => now(),
        ]);
        AgencyAdminProfile::query()->create(['user_id' => $membre->id, 'agency_id' => $agency->id]);

        return [$admin, $membre];
    }

    /**
     * @param  list<array<string, mixed>>  $data
     * @return array<string, mixed>
     */
    private function ligne(array $data, User $membre): array
    {
        $ligne = collect($data)->firstWhere('id', $membre->id);
        $this->assertIsArray($ligne, 'le membre de l’équipe est listé');

        return $ligne;
    }
}
