<?php

namespace Tests\Feature\Audit;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Audit\ActivityLogExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1717 (P139.02) — `causer_role` se juge dans l'agence de la ligne, pas sur tous les profils du
 * compte : un agent de A, admin de B, qui agit chez A sort « agent » dans l'export de A, et l'admin
 * de A n'apprend pas le rôle tenu chez B. L'export de la console suit la même règle, ligne par ligne.
 */
class RoleDuCauseurDansLExportTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: Agency, 2: Agency} l'admin de A, l'agence A, l'agence B */
    private function scenario(): array
    {
        $agenceA = Agency::factory()->create();
        $agenceB = Agency::factory()->create();
        $adminA = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $adminA->id, 'agency_id' => $agenceA->id]);

        $double = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $agenceA->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $agenceB->id]);

        foreach (['chez-a' => $agenceA, 'chez-b' => $agenceB] as $description => $agence) {
            activity()
                ->performedOn(Property::factory()->create(['agency_id' => $agence->id]))
                ->causedBy($double)
                ->event('updated')
                ->log($description);
        }

        return [$adminA, $agenceA, $agenceB];
    }

    /** @param list<array<string,mixed>> $rows */
    private function role(array $rows, string $description): mixed
    {
        $row = collect($rows)->firstWhere('description', $description);
        $this->assertNotNull($row, "ligne {$description} absente de l'export");

        return $row['causer_role'];
    }

    public function test_l_export_d_agence_donne_le_role_tenu_dans_cette_agence(): void
    {
        [$adminA, $agenceA] = $this->scenario();

        $rows = app(ActivityLogExporter::class)->buildPayload($adminA, [], $agenceA->id)['rows'];

        $this->assertSame('agent', $this->role($rows, 'chez-a'));
        $this->assertNull(collect($rows)->firstWhere('description', 'chez-b'), 'la ligne de B sort de l\'export de A');
    }

    public function test_l_export_de_la_console_donne_le_role_tenu_dans_l_agence_de_chaque_ligne(): void
    {
        $this->scenario();

        $rows = app(ActivityLogExporter::class)->payloadForQuery(Activity::query(), 'console')['rows'];

        $this->assertSame('agent', $this->role($rows, 'chez-a'));
        $this->assertSame('agency_admin', $this->role($rows, 'chez-b'));
    }
}
