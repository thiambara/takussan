<?php

namespace Tests\Feature\Tenant;

use App\Console\Commands\RemindTenantOnboarding;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\TenantInventoryReminderNotification;
use App\Services\Model\LeaseService;
use App\Services\Tenant\TenantOnboardingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-266 — Coverage for the tenant onboarding checklist :
 *   - auto-creation on LeaseActivated (with agency flag respected)
 *   - markItem state transitions + completed_at promotion
 *   - inventory-signed → inventory_completed_at via observer
 *   - first lease payment → first_payment_at via observer
 *   - hourly cron J+7 reminders + idempotence
 *   - GET / POST endpoints
 *   - activity log entries
 */
class TenantOnboardingChecklistTest extends TestCase
{
    use RefreshDatabase;

    public function test_activating_a_lease_creates_a_checklist(): void
    {
        Notification::fake();
        [, $lease, $tenantUser] = $this->scaffoldDraftWithTenantUser();

        app(LeaseService::class)->activate($lease);

        $checklist = TenantOnboardingChecklist::query()->where('lease_id', $lease->id)->first();
        $this->assertNotNull($checklist, 'checklist should be created on activation');
        $this->assertSame($tenantUser->id, $checklist->user_id);
        $this->assertNull($checklist->completed_at);
    }

    public function test_creation_is_skipped_when_agency_flag_is_disabled(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create([
            'settings' => ['tenant_onboarding_enabled' => false],
        ]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
            'status' => LeaseStatus::Draft,
        ]);

        app(LeaseService::class)->activate($lease);

        $this->assertDatabaseMissing('tenant_onboarding_checklists', ['lease_id' => $lease->id]);
    }

    public function test_creation_logs_activity(): void
    {
        Notification::fake();
        [, $lease] = $this->scaffoldDraftWithTenantUser();

        app(LeaseService::class)->activate($lease);

        $entry = Activity::query()->where('description', 'tenant_checklist_created')->first();
        $this->assertNotNull($entry, 'tenant_checklist_created activity should be logged');
        $this->assertSame($lease->id, (int) ($entry->properties['lease_id'] ?? 0));
    }

    public function test_markitem_sets_the_corresponding_timestamp(): void
    {
        $checklist = $this->makeChecklist();

        $service = app(TenantOnboardingService::class);
        $service->markItem($checklist, TenantOnboardingChecklist::ITEM_WELCOME_SEEN);

        $this->assertNotNull($checklist->fresh()->welcome_seen_at);
        $this->assertNull($checklist->fresh()->completed_at, 'welcome_seen alone does not complete the checklist');
    }

    public function test_completed_at_is_set_when_both_required_items_are_present(): void
    {
        $checklist = $this->makeChecklist();
        $service = app(TenantOnboardingService::class);

        $service->markItem($checklist, TenantOnboardingChecklist::ITEM_INVENTORY_COMPLETED);
        $this->assertNull($checklist->fresh()->completed_at);

        $service->markItem($checklist, TenantOnboardingChecklist::ITEM_FIRST_PAYMENT);

        $fresh = $checklist->fresh();
        $this->assertNotNull($fresh->inventory_completed_at);
        $this->assertNotNull($fresh->first_payment_at);
        $this->assertNotNull($fresh->completed_at, 'completed_at should be set');

        $this->assertNotNull(
            Activity::query()->where('description', 'tenant_checklist_completed')->first(),
            'tenant_checklist_completed activity should be logged',
        );
    }

    public function test_inventory_signed_triggers_inventory_completed(): void
    {
        $checklist = $this->makeChecklist();
        $lease = $checklist->lease;

        $inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $lease->property_id,
            'tenant_id' => $lease->tenant_id,
            'type' => InventoryType::MoveIn,
            'status' => InventoryStatus::PendingSignature,
        ]);

        $inventory->update(['status' => InventoryStatus::Signed, 'signed_at' => now()]);

        $this->assertNotNull($checklist->fresh()->inventory_completed_at);
    }

    public function test_inventory_signed_does_not_flip_for_move_out_type(): void
    {
        $checklist = $this->makeChecklist();
        $lease = $checklist->lease;

        $inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $lease->property_id,
            'tenant_id' => $lease->tenant_id,
            'type' => InventoryType::MoveOut,
            'status' => InventoryStatus::PendingSignature,
        ]);

        $inventory->update(['status' => InventoryStatus::Signed, 'signed_at' => now()]);

        $this->assertNull($checklist->fresh()->inventory_completed_at);
    }

    public function test_first_lease_payment_triggers_first_payment_item(): void
    {
        $checklist = $this->makeChecklist();
        $lease = $checklist->lease;

        // Mass-insert from generateSchedule wouldn't qualify (pending, no
        // payment_method) — but a manually created paid one does.
        LeasePayment::create([
            'lease_id' => $lease->id,
            'reference_number' => 'LPY-T1',
            'payer_id' => $lease->tenant_id,
            'amount' => 250_000,
            'currency' => 'XOF',
            'payment_method' => PaymentMethod::Wave,
            'payment_type' => LeasePaymentType::Rent,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'due_date' => now()->toDateString(),
            'paid_at' => now(),
            'status' => PaymentStatus::Paid,
        ]);

        $this->assertNotNull($checklist->fresh()->first_payment_at);
    }

    public function test_schedule_generated_payments_dont_trigger_first_payment(): void
    {
        $checklist = $this->makeChecklist();
        $lease = $checklist->lease;

        // Pending placeholder, no payment_method, no paid_at → ignored.
        LeasePayment::create([
            'lease_id' => $lease->id,
            'reference_number' => 'LPY-S1',
            'payer_id' => $lease->tenant_id,
            'amount' => 250_000,
            'currency' => 'XOF',
            'payment_type' => LeasePaymentType::Rent,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'due_date' => now()->toDateString(),
            'status' => PaymentStatus::Pending,
        ]);

        $this->assertNull($checklist->fresh()->first_payment_at);
    }

    public function test_marking_payment_paid_via_update_triggers_first_payment(): void
    {
        $checklist = $this->makeChecklist();
        $lease = $checklist->lease;

        $payment = LeasePayment::create([
            'lease_id' => $lease->id,
            'reference_number' => 'LPY-S2',
            'payer_id' => $lease->tenant_id,
            'amount' => 250_000,
            'currency' => 'XOF',
            'payment_type' => LeasePaymentType::Rent,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'due_date' => now()->toDateString(),
            'status' => PaymentStatus::Pending,
        ]);

        $this->assertNull($checklist->fresh()->first_payment_at);

        $payment->update(['status' => PaymentStatus::Paid, 'paid_at' => now()]);

        $this->assertNotNull($checklist->fresh()->first_payment_at);
    }

    public function test_cron_sends_reminders_after_seven_days_and_is_idempotent(): void
    {
        Notification::fake();

        $checklist = $this->makeChecklist();
        // Backdate creation to > 7 days.
        $checklist->forceFill(['created_at' => now()->subDays(8)])->save();

        $tenantUser = $checklist->user;
        $primaryAdmin = User::factory()->create();
        $checklist->lease->agency->update(['primary_admin_id' => $primaryAdmin->id]);

        $this->artisan(RemindTenantOnboarding::class)->assertSuccessful();

        Notification::assertSentTo($tenantUser, TenantInventoryReminderNotification::class);
        Notification::assertSentTo($primaryAdmin, AgentTenantInventoryReminderNotification::class);

        $reminders = $checklist->fresh()->reminders_sent;
        $this->assertCount(1, $reminders);
        $this->assertSame(
            TenantOnboardingChecklist::REMINDER_INVENTORY_D7,
            $reminders[0]['type'] ?? null,
        );

        // Second pass — must not resend.
        Notification::fake();
        $this->artisan(RemindTenantOnboarding::class)->assertSuccessful();
        Notification::assertNothingSent();
    }

    public function test_cron_does_not_remind_recent_checklists(): void
    {
        Notification::fake();

        $checklist = $this->makeChecklist();
        $checklist->forceFill(['created_at' => now()->subDays(2)])->save();

        $this->artisan(RemindTenantOnboarding::class)->assertSuccessful();
        Notification::assertNothingSent();
    }

    public function test_get_endpoint_returns_checklist_for_tenant(): void
    {
        $checklist = $this->makeChecklist();
        $tenantUser = $checklist->user;

        $this->actingAs($tenantUser)
            ->getJson("/api/me/leases/{$checklist->lease_id}/onboarding-checklist")
            ->assertOk()
            ->assertJsonPath('data.id', $checklist->id)
            ->assertJsonPath('data.lease_id', $checklist->lease_id);
    }

    public function test_get_endpoint_forbids_unrelated_user(): void
    {
        $checklist = $this->makeChecklist();
        $other = User::factory()->create();

        $this->actingAs($other)
            ->getJson("/api/me/leases/{$checklist->lease_id}/onboarding-checklist")
            ->assertForbidden();
    }

    public function test_complete_endpoint_marks_documents_acknowledged(): void
    {
        $checklist = $this->makeChecklist();
        $tenantUser = $checklist->user;

        $this->actingAs($tenantUser)
            ->postJson("/api/me/leases/{$checklist->lease_id}/onboarding-checklist/documents_acknowledged/complete")
            ->assertOk()
            ->assertJsonPath('data.id', $checklist->id);

        $this->assertNotNull($checklist->fresh()->documents_acknowledged_at);
    }

    public function test_complete_endpoint_rejects_unknown_item(): void
    {
        $checklist = $this->makeChecklist();
        $tenantUser = $checklist->user;

        // The route constraint allows lowercase + underscore but the
        // controller validates against the canonical list.
        $this->actingAs($tenantUser)
            ->postJson("/api/me/leases/{$checklist->lease_id}/onboarding-checklist/foobar/complete")
            ->assertStatus(422);
    }

    public function test_pending_endpoint_lists_overdue_checklists_for_agency(): void
    {
        $agency = Agency::factory()->create();
        $member = User::factory()->create(['agency_id' => $agency->id]);

        $oldChecklist = $this->makeChecklist($agency);
        $oldChecklist->forceFill(['created_at' => now()->subDays(10)])->save();

        $recentChecklist = $this->makeChecklist($agency);
        $recentChecklist->forceFill(['created_at' => now()->subDays(2)])->save();

        $response = $this->actingAs($member)
            ->getJson("/api/agencies/{$agency->id}/tenant-onboarding-pending")
            ->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($oldChecklist->id, $ids);
        $this->assertNotContains($recentChecklist->id, $ids);
    }

    public function test_pending_endpoint_forbids_unrelated_agency_member(): void
    {
        $agency = Agency::factory()->create();
        $other = User::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        $this->actingAs($other)
            ->getJson("/api/agencies/{$agency->id}/tenant-onboarding-pending")
            ->assertForbidden();
    }

    /**
     * @return array{0: LeaseService, 1: Lease, 2: User}
     */
    private function scaffoldDraftWithTenantUser(?Agency $agency = null): array
    {
        $agency ??= Agency::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
            'status' => LeaseStatus::Draft,
        ]);

        return [app(LeaseService::class), $lease->fresh(), $tenantUser];
    }

    private function makeChecklist(?Agency $agency = null): TenantOnboardingChecklist
    {
        $agency ??= Agency::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->active()->create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
        ]);

        return TenantOnboardingChecklist::create([
            'lease_id' => $lease->id,
            'user_id' => $tenantUser->id,
        ])->fresh();
    }
}
