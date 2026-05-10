<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

/**
 * TCK-144 — Cross-tenant audit visibility for super-admin. The
 * agency_admin-scoped path is covered by AuditLogControllerTest.
 */
class CrossTenantAuditTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_super_admin_sees_logs_from_every_agency(): void
    {
        $this->actingAsRole('super_admin');
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        foreach ([$agencyA, $agencyB] as $agency) {
            KycDossier::create([
                'subject_type' => Agency::class,
                'subject_id' => $agency->id,
                'status' => KycDossierStatus::Verified,
            ]);
        }

        // Trigger two log entries from different tenants by issuing the
        // verify endpoint twice — drives the activity logger naturally.
        $this->postJson("/api/admin/agencies/{$agencyA->id}/verify")->assertOk();
        $this->postJson("/api/admin/agencies/{$agencyB->id}/verify")->assertOk();

        $response = $this->getJson('/api/admin/audit?filter[event]=super_admin_agency_verified&sort=-created_at')
            ->assertOk()
            ->assertJsonStructure(['data' => [['id', 'event', 'subject_id']], 'meta' => ['total']]);

        $events = collect($response->json('data'))->pluck('subject_id')->all();
        $this->assertContains($agencyA->id, $events);
        $this->assertContains($agencyB->id, $events);
    }

    public function test_filters_by_causer_id(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $other = User::factory()->create();
        $agency = Agency::factory()->create();

        $this->postJson("/api/admin/agencies/{$agency->id}/suspend")->assertOk();

        $this->getJson("/api/admin/audit?filter[causer_id]={$actor->id}&filter[event]=super_admin_agency_suspended")
            ->assertOk()
            ->assertJsonPath('meta.total', fn ($v) => $v >= 1);

        $this->getJson("/api/admin/audit?filter[causer_id]={$other->id}&filter[event]=super_admin_agency_suspended")
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    /**
     * Defense-in-depth: even if a future activity-log writer leaks a sensitive
     * value into `properties`, the cross-tenant view must redact common
     * sensitive key names before serializing. Activity-log writers should be
     * audited separately — this test only proves the controller-side guard.
     */
    public function test_sensitive_keys_in_properties_are_redacted(): void
    {
        $actor = $this->actingAsRole('super_admin');

        // Seed an activity log row directly with deliberately sensitive
        // property keys — bypasses the actual writers (which the redactor
        // is supposed to backstop).
        activity('Test')
            ->causedBy($actor)
            ->withProperties([
                'password' => 'plaintext-secret',
                'api_key' => 'sk_live_xxx',
                'two_factor_secret' => 'TOTP123',
                'recovery_code' => 'codes',
                'nested' => [
                    'token' => 'bearer-abc',
                    'safe_field' => 'visible',
                ],
                'safe' => 'kept',
            ])
            ->event('redaction_probe')
            ->log('redaction probe');

        $response = $this->getJson('/api/admin/audit?filter[event]=redaction_probe')
            ->assertOk();

        $entry = collect($response->json('data'))->firstWhere('event', 'redaction_probe');
        $this->assertNotNull($entry, 'expected the seeded log entry to be returned');
        $props = $entry['properties'];

        $this->assertSame('[REDACTED]', $props['password']);
        $this->assertSame('[REDACTED]', $props['api_key']);
        $this->assertSame('[REDACTED]', $props['two_factor_secret']);
        $this->assertSame('[REDACTED]', $props['recovery_code']);
        $this->assertSame('[REDACTED]', $props['nested']['token']);
        $this->assertSame('visible', $props['nested']['safe_field']);
        $this->assertSame('kept', $props['safe']);

        // Sanity: the underlying row still holds the raw value — redaction
        // happens at serialization time only, so a follow-up audit can still
        // recover the truth from the DB.
        $row = Activity::where('event', 'redaction_probe')->first();
        $this->assertSame('plaintext-secret', $row->properties->get('password'));
    }
}
