<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\BaseTestCase;

/**
 * TCK-252 — AgencyUpgradeRequest model + relations.
 *
 * Couvre :
 *  - création nominale + persistance des champs (AC1)
 *  - scopes `pending()` / `historical()`
 *  - relation `agency.pendingUpgradeRequest`
 *  - contrainte « une seule pending par agence » (AC2 — Postgres native /
 *    SQLite check applicatif)
 *  - sérialisation JSON de l'enum status (AC4)
 */
class AgencyUpgradeRequestTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_factory_creates_pending_request_with_expected_fields(): void
    {
        $agency = Agency::factory()->individual()->create();
        $admin = User::factory()->create();

        $request = AgencyUpgradeRequest::factory()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $admin->id,
        ]);

        $this->assertDatabaseHas('agency_upgrade_requests', [
            'id' => $request->id,
            'agency_id' => $agency->id,
            'submitted_by' => $admin->id,
            'status' => AgencyUpgradeRequestStatus::Pending->value,
        ]);

        $fresh = $request->fresh();
        $this->assertSame(AgencyUpgradeRequestStatus::Pending, $fresh->status);
        $this->assertNotNull($fresh->submitted_at);
        $this->assertNull($fresh->reviewed_at);
        $this->assertNull($fresh->reviewed_by);
    }

    public function test_pending_scope_returns_pending_requests_only(): void
    {
        $pending = AgencyUpgradeRequest::factory()->pending()->create();
        AgencyUpgradeRequest::factory()->approved()->create();
        AgencyUpgradeRequest::factory()->rejected()->create();
        AgencyUpgradeRequest::factory()->revoked()->create();

        $ids = AgencyUpgradeRequest::query()->pending()->pluck('id')->all();

        $this->assertSame([$pending->id], $ids);
    }

    public function test_historical_scope_returns_approved_rejected_and_revoked(): void
    {
        AgencyUpgradeRequest::factory()->pending()->create();
        $approved = AgencyUpgradeRequest::factory()->approved()->create();
        $rejected = AgencyUpgradeRequest::factory()->rejected()->create();
        $revoked = AgencyUpgradeRequest::factory()->revoked()->create();

        $ids = AgencyUpgradeRequest::query()->historical()->pluck('id')->sort()->values()->all();
        $expected = collect([$approved->id, $rejected->id, $revoked->id])->sort()->values()->all();

        $this->assertSame($expected, $ids);
    }

    public function test_agency_pending_upgrade_request_returns_null_when_none(): void
    {
        $agency = Agency::factory()->individual()->create();

        $this->assertNull($agency->pendingUpgradeRequest);
    }

    public function test_agency_pending_upgrade_request_returns_the_pending_one(): void
    {
        $agency = Agency::factory()->individual()->create();

        // Historical noise that must not be picked up by the relation.
        AgencyUpgradeRequest::factory()->rejected()->create(['agency_id' => $agency->id]);
        AgencyUpgradeRequest::factory()->revoked()->create(['agency_id' => $agency->id]);

        $pending = AgencyUpgradeRequest::factory()->pending()->create(['agency_id' => $agency->id]);

        $this->assertNotNull($agency->fresh()->pendingUpgradeRequest);
        $this->assertSame($pending->id, $agency->fresh()->pendingUpgradeRequest->id);
    }

    public function test_agency_upgrade_requests_returns_full_history(): void
    {
        $agency = Agency::factory()->individual()->create();
        AgencyUpgradeRequest::factory()->rejected()->create(['agency_id' => $agency->id]);
        AgencyUpgradeRequest::factory()->revoked()->create(['agency_id' => $agency->id]);
        AgencyUpgradeRequest::factory()->pending()->create(['agency_id' => $agency->id]);

        $this->assertCount(3, $agency->fresh()->upgradeRequests);
    }

    public function test_only_one_pending_request_per_agency_is_allowed(): void
    {
        $agency = Agency::factory()->individual()->create();
        AgencyUpgradeRequest::factory()->pending()->create(['agency_id' => $agency->id]);

        // Should fail both on Postgres (partial unique index) and on SQLite
        // (applicative fallback in `AgencyUpgradeRequest::booted`).
        $this->expectException(QueryException::class);

        AgencyUpgradeRequest::factory()->pending()->create(['agency_id' => $agency->id]);
    }

    public function test_a_new_pending_can_be_created_after_a_historical_one(): void
    {
        $agency = Agency::factory()->individual()->create();
        AgencyUpgradeRequest::factory()->rejected()->create(['agency_id' => $agency->id]);

        // No pending currently exists → a new pending must be allowed (the
        // applicant is permitted to retry after a rejection).
        $new = AgencyUpgradeRequest::factory()->pending()->create(['agency_id' => $agency->id]);

        $this->assertSame(AgencyUpgradeRequestStatus::Pending, $new->fresh()->status);
    }

    public function test_status_enum_serializes_to_string_in_json(): void
    {
        $request = AgencyUpgradeRequest::factory()->pending()->create();

        $payload = $request->toArray();

        $this->assertSame('pending', $payload['status']);
        $this->assertSame(
            'pending',
            json_decode(json_encode($request), true)['status']
        );
    }
}
