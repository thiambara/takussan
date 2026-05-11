<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Document;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\User;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\PermissionRegistrar;
use Tests\BaseTestCase;

/**
 * TCK-267 — agency-side `individual → standard` upgrade flow.
 *
 * Covers:
 *  - submission happy path + activity log + notification fan-out (AC1, AC6)
 *  - 403 when agency is already standard (AC2)
 *  - 403 when actor is not an agency_admin
 *  - 422 when a pending request already exists (AC3)
 *  - revocation by submitter / by another admin (AC4)
 *  - 403 when revoking from a non-admin
 *  - 422 when revoking a non-pending request
 *  - listing scoped per agency (no cross-tenant leak)
 *  - upload validation: missing file, oversize, wrong MIME
 */
class AgencyUpgradeRequestSubmissionTest extends BaseTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('media');
    }

    /**
     * @return array{Agency, User}
     */
    private function individualAgencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        return [$agency, $admin];
    }

    /**
     * @return array<string,mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'rc' => 'RC-DKR-2026-001',
            'ninea' => '0123456789012',
            'rib_pro' => 'SN012 01234 0123456789012 34',
            'company_legal_name' => 'Takussan Immo SARL',
            'address_fiscale' => '12 Avenue Léopold Sédar Senghor, Dakar',
            'planned_agents_count' => 5,
            'statuts_doc' => UploadedFile::fake()->create('statuts.pdf', 800, 'application/pdf'),
        ], $overrides);
    }

    public function test_individual_agency_admin_submits_with_full_payload_and_pdf(): void
    {
        Notification::fake();
        [$agency, $admin] = $this->individualAgencyWithAdmin();

        // Seed a super-admin so the fan-out has a recipient.
        $registrar = app(PermissionRegistrar::class);
        $registrar->setPermissionsTeamId(null);
        $superAdmin = User::factory()->create();
        $superAdmin->assignRole('super_admin');

        $response = $this->postJson(
            "/api/agencies/{$agency->id}/upgrade-requests",
            $this->validPayload(),
        );

        $response->assertStatus(201)
            ->assertJsonPath('data.agency_id', $agency->id)
            ->assertJsonPath('data.status', AgencyUpgradeRequestStatus::Pending->value)
            ->assertJsonPath('data.submitted_by', $admin->id)
            ->assertJsonPath('data.planned_agents_count', 5)
            ->assertJsonPath('data.company_legal_name', 'Takussan Immo SARL');

        $request = AgencyUpgradeRequest::query()->where('agency_id', $agency->id)->firstOrFail();
        $this->assertSame(AgencyUpgradeRequestStatus::Pending, $request->status);

        // Statuts doc was attached as a polymorphic Document with a media item.
        $this->assertDatabaseHas('documents', [
            'documentable_id' => $request->id,
            'documentable_type' => AgencyUpgradeRequest::class,
            'uploaded_by' => $admin->id,
        ]);
        $document = Document::query()
            ->where('documentable_type', AgencyUpgradeRequest::class)
            ->where('documentable_id', $request->id)
            ->firstOrFail();
        $this->assertSame(1, $document->getMedia('file')->count());

        // Activity log row.
        $log = Activity::query()->where('event', 'agency_upgrade_requested')->first();
        $this->assertNotNull($log);
        $this->assertSame($admin->id, $log->causer_id);
        $this->assertSame($agency->id, data_get($log->properties, 'agency_id'));
        $this->assertSame(5, data_get($log->properties, 'planned_agents_count'));

        // Super-admins were notified.
        Notification::assertSentTo($superAdmin, AgencyUpgradeRequestSubmittedNotification::class);
    }

    public function test_standard_agency_admin_gets_403(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->postJson(
            "/api/agencies/{$agency->id}/upgrade-requests",
            $this->validPayload(),
        )->assertStatus(403);

        Notification::assertNothingSent();
    }

    public function test_non_admin_actor_gets_403(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        $this->postJson(
            "/api/agencies/{$agency->id}/upgrade-requests",
            $this->validPayload(),
        )->assertStatus(403);
    }

    public function test_duplicate_pending_request_returns_422(): void
    {
        Notification::fake();
        [$agency, $admin] = $this->individualAgencyWithAdmin();

        AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $admin->id,
        ]);

        $this->postJson(
            "/api/agencies/{$agency->id}/upgrade-requests",
            $this->validPayload(),
        )->assertStatus(422);
    }

    public function test_submitter_can_revoke_their_pending_request(): void
    {
        Notification::fake();
        [$agency, $admin] = $this->individualAgencyWithAdmin();
        $request = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $admin->id,
        ]);

        $this->deleteJson("/api/agencies/{$agency->id}/upgrade-requests/{$request->id}")
            ->assertStatus(200)
            ->assertJsonPath('data.status', AgencyUpgradeRequestStatus::Revoked->value);

        $this->assertSame(AgencyUpgradeRequestStatus::Revoked, $request->fresh()->status);

        $this->assertNotNull(
            Activity::query()->where('event', 'agency_upgrade_revoked')->first(),
        );
    }

    public function test_other_agency_admin_can_revoke_pending_request(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);

        // Original submitter — created first so the agency_id mutator wires
        // an OwnerProfile + agency_admin role under the agency team_id.
        $original = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $request = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $original->id,
        ]);

        // A second agency_admin of the same agency revokes it.
        $other = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->deleteJson("/api/agencies/{$agency->id}/upgrade-requests/{$request->id}")
            ->assertStatus(200);

        $this->assertSame(AgencyUpgradeRequestStatus::Revoked, $request->fresh()->status);
    }

    public function test_non_admin_cannot_revoke_pending_request(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $request = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $admin->id,
        ]);

        // Switch acting user to a plain agent of the same agency.
        $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        $this->deleteJson("/api/agencies/{$agency->id}/upgrade-requests/{$request->id}")
            ->assertStatus(403);
    }

    public function test_revoking_already_approved_request_returns_422(): void
    {
        Notification::fake();
        [$agency, $admin] = $this->individualAgencyWithAdmin();
        $request = AgencyUpgradeRequest::factory()->approved()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $admin->id,
        ]);

        $this->deleteJson("/api/agencies/{$agency->id}/upgrade-requests/{$request->id}")
            ->assertStatus(422);
    }

    public function test_listing_is_scoped_per_agency(): void
    {
        Notification::fake();
        [$agency, $admin] = $this->individualAgencyWithAdmin();

        AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $admin->id,
        ]);

        // Request belonging to another agency must not appear.
        $other = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        AgencyUpgradeRequest::factory()->pending()->create(['agency_id' => $other->id]);

        $response = $this->getJson("/api/agencies/{$agency->id}/upgrade-requests")
            ->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('agency_id')->unique()->all();
        $this->assertSame([$agency->id], $ids);
    }

    public function test_missing_statuts_doc_returns_422(): void
    {
        [$agency] = $this->individualAgencyWithAdmin();

        $payload = $this->validPayload();
        unset($payload['statuts_doc']);

        $this->postJson("/api/agencies/{$agency->id}/upgrade-requests", $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['statuts_doc']);
    }

    public function test_oversize_statuts_doc_returns_422(): void
    {
        [$agency] = $this->individualAgencyWithAdmin();

        // 11 MB > 10 MB cap.
        $payload = $this->validPayload([
            'statuts_doc' => UploadedFile::fake()->create('statuts.pdf', 11 * 1024, 'application/pdf'),
        ]);

        $this->postJson("/api/agencies/{$agency->id}/upgrade-requests", $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['statuts_doc']);
    }

    public function test_wrong_mime_statuts_doc_returns_422(): void
    {
        [$agency] = $this->individualAgencyWithAdmin();

        $payload = $this->validPayload([
            'statuts_doc' => UploadedFile::fake()->create('statuts.exe', 100, 'application/octet-stream'),
        ]);

        $this->postJson("/api/agencies/{$agency->id}/upgrade-requests", $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['statuts_doc']);
    }
}
