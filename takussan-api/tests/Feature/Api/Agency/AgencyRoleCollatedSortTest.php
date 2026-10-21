<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-1118 (P87.02) — les rôles d'une agence se rangent en `COLLATE "und-x-icu"` (ADR-0025,
 * amendement du 2026-10-19), au défaut comme sur `sort=name`.
 *
 * La base est en `--locale=C` : un `ORDER BY name` nu suit l'ordre des octets, et un rôle saisi en
 * minuscule ou commençant par « É » passait après « Zélateur ».
 */
class AgencyRoleCollatedSortTest extends ApiTestCase
{
    use RefreshDatabase;

    private const SAISIS = ['Zélateur', 'gérant', 'Comptable', 'Équipe terrain'];

    private const ORDRE = ['Comptable', 'Équipe terrain', 'gérant', 'Zélateur'];

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->withTwoFactor()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);

        foreach (self::SAISIS as $nom) {
            AgencyRole::factory()->create([
                'agency_id' => $this->agency->id,
                'name' => $nom,
                'base_profile_type' => AgencyRoleBaseType::Agent->value,
            ]);
        }
    }

    /** @return array<string, array{0: string, 1: list<string>}> */
    public static function tris(): array
    {
        return [
            'défaut' => ['', self::ORDRE],
            'montant' => ['&sort=name', self::ORDRE],
            'descendant' => ['&sort=-name', array_reverse(self::ORDRE)],
        ];
    }

    #[DataProvider('tris')]
    public function test_les_roles_sont_ranges_dans_l_ordre_icu(string $tri, array $attendu): void
    {
        $noms = $this->actingAsApi($this->admin)
            ->apiGet("/api/agencies/{$this->agency->id}/roles?per_page=100{$tri}")
            ->assertOk()
            ->json('data.*.name');

        // Les rôles système de l'agence s'intercalent : seul l'ordre relatif des rôles saisis compte.
        $this->assertSame($attendu, array_values(array_filter($noms, fn (string $n) => in_array($n, self::SAISIS, true))));
    }
}
