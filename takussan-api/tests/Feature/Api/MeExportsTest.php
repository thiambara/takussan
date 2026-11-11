<?php

namespace Tests\Feature\Api;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2627 — AC3 : « Mes derniers exports », relus du journal `data_exported` que l'export écrit
 * déjà. Ceux de l'appelant seul, dans son agence active ; rien n'est stocké ni retéléchargé.
 */
class MeExportsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
    }

    public function test_ac3_only_the_callers_exports_with_their_parameters(): void
    {
        $a = $this->agencyAdmin($this->agency);
        $b = $this->agencyAdmin($this->agency);

        $this->actingAsApi($a)->get('/api/export/payments?format=xlsx&from=2026-10-01&to=2026-10-31')->assertOk();
        Carbon::setTestNow('2026-11-15 10:05:00');
        $this->actingAsApi($b)->get('/api/export/properties?format=csv')->assertOk();
        $this->assertSame(2, Activity::query()->where('event', 'data_exported')->count(), 'les deux exports sont journalisés');

        $rows = $this->actingAsApi($a)->getJson('/api/me/exports')->assertOk()->json('data');

        $this->assertSame([[
            'at' => '2026-11-15T10:00:00+00:00',
            'entity' => 'payments',
            'format' => 'xlsx',
            'filters' => ['from' => '2026-10-01', 'to' => '2026-10-31'],
            'row_count' => 0,
        ]], $rows);
    }

    public function test_only_the_active_agency_most_recent_first(): void
    {
        $a = $this->agencyAdmin($this->agency);
        $this->logged($a, $this->agency->id, 'leases', '2026-11-10 09:00:00');
        $this->logged($a, $this->agency->id, 'customers', '2026-11-12 09:00:00');
        $this->logged($a, Agency::factory()->create()->id, 'payments', '2026-11-13 09:00:00');

        $rows = $this->actingAsApi($a)->getJson('/api/me/exports')->assertOk()->json('data');

        $this->assertSame(['customers', 'leases'], array_column($rows, 'entity'));
        $this->assertSame(['from' => null, 'to' => null], $rows[0]['filters']);
    }

    public function test_ten_by_default_and_fifty_at_most(): void
    {
        $a = $this->agencyAdmin($this->agency);
        foreach (range(1, 55) as $i) {
            $this->logged($a, $this->agency->id, 'properties', Carbon::parse('2026-11-01 00:00:00')->addMinutes($i)->toDateTimeString());
        }
        $this->actingAsApi($a);

        $this->assertCount(10, $this->getJson('/api/me/exports')->assertOk()->json('data'));
        $this->assertCount(50, $this->getJson('/api/me/exports?limit=50')->assertOk()->json('data'));
        $this->getJson('/api/me/exports?limit=51')->assertUnprocessable();
    }

    public function test_a_guest_is_refused(): void
    {
        $this->getJson('/api/me/exports')->assertUnauthorized();
    }

    /** La forme exacte de l'écrivain (`ExportController::show`). */
    private function logged(User $user, int $agencyId, string $entity, string $at): void
    {
        Carbon::setTestNow($at);
        activity('export')
            ->causedBy($user)
            ->event('data_exported')
            ->withProperties([
                'entity' => $entity,
                'filters' => [],
                'row_count' => 3,
                'agency_id' => $agencyId,
                'format' => 'csv',
            ])
            ->log('data_exported');
        Carbon::setTestNow('2026-11-15 10:00:00');
    }
}
