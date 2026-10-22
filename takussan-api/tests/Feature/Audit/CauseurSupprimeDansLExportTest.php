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
 * TCK-1395 (P139.01) — l'export du journal ne dit pas « système » d'un compte supprimé : une ligne
 * qui garde son `causer_id` mais dont le causeur ne se charge plus (suppression douce) sort en
 * `deleted#<id>` / `deleted`, comme l'écran du journal (`AuditTrail.tsx`). `system` reste réservé
 * aux lignes sans `causer_id`. Les deux exports passent par le même `mapRow()`.
 */
class CauseurSupprimeDansLExportTest extends TestCase
{
    use RefreshDatabase;

    private function logOn(object $subject, ?User $causer, string $description): Activity
    {
        $logger = activity()->performedOn($subject)->event('updated');
        if ($causer !== null) {
            $logger->causedBy($causer);
        }

        /** @var Activity */
        return $logger->log($description);
    }

    /** @return array{0: User, 1: Agency, 2: User} l'admin, l'agence, l'agent supprimé */
    private function scenario(): array
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $this->logOn($property, $agent, 'temoin-supprime');
        $this->logOn($property, null, 'temoin-systeme');
        $agent->delete();

        return [$admin, $agency, $agent];
    }

    /** @param list<array<string,mixed>> $rows */
    private function row(array $rows, string $description): array
    {
        $row = collect($rows)->firstWhere('description', $description);
        $this->assertNotNull($row, "ligne {$description} absente de l'export");

        return $row;
    }

    public function test_l_export_d_agence_nomme_le_compte_supprime(): void
    {
        [$admin, $agency, $agent] = $this->scenario();

        $rows = app(ActivityLogExporter::class)->buildPayload($admin, [], $agency->id)['rows'];

        $supprime = $this->row($rows, 'temoin-supprime');
        $this->assertSame("deleted#{$agent->id}", $supprime['causer_email']);
        $this->assertSame('deleted', $supprime['causer_role']);

        $systeme = $this->row($rows, 'temoin-systeme');
        $this->assertSame('system', $systeme['causer_email']);
        $this->assertSame('system', $systeme['causer_role']);
    }

    public function test_l_export_de_la_console_nomme_le_compte_supprime(): void
    {
        [, , $agent] = $this->scenario();

        $rows = app(ActivityLogExporter::class)->payloadForQuery(Activity::query(), 'console')['rows'];

        $supprime = $this->row($rows, 'temoin-supprime');
        $this->assertSame("deleted#{$agent->id}", $supprime['causer_email']);
        $this->assertSame('deleted', $supprime['causer_role']);

        $systeme = $this->row($rows, 'temoin-systeme');
        $this->assertSame('system', $systeme['causer_email']);
        $this->assertSame('system', $systeme['causer_role']);
    }
}
