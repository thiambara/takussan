<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Invoice\InvoiceNumberAllocator;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use ReflectionMethod;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC12) — une facture reçoit son numéro à l'émission, continu par agence et par année, et
 * par UN seul point. Les sites d'émission sont énumérés : en retirer un rougit ce test.
 */
class InvoiceNumberingTest extends TestCase
{
    use BuildsInvoices;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-07 10:00:00');
        Notification::fake();
    }

    public function test_ac12_numbers_are_continuous_per_agency_and_given_at_emission(): void
    {
        [$a, $adminA, $customerA] = $this->invoicingAgency();
        [$b, $adminB, $customerB] = $this->invoicingAgency();

        $cancelledDraft = $this->draftOf($a, $customerA);
        $drafts = [$this->draftOf($a, $customerA), $this->draftOf($a, $customerA), $this->draftOf($a, $customerA)];
        Sanctum::actingAs($adminA);
        $this->postJson("/api/invoices/{$cancelledDraft->id}/cancel")->assertOk();

        foreach ($drafts as $draft) {
            $this->assertStringStartsWith('INV-', $draft->reference_number);
            $this->postJson("/api/invoices/{$draft->id}/send")->assertOk();
        }

        $this->assertSame(
            ['FA-2026-00001', 'FA-2026-00002', 'FA-2026-00003'],
            array_map(fn (Invoice $i): string => $i->fresh()->reference_number, $drafts),
        );
        $this->assertNull($cancelledDraft->fresh()->sequence_number, 'un brouillon annulé ne consomme aucun numéro');

        Sanctum::actingAs($adminB);
        $first = $this->draftOf($b, $customerB);
        $this->postJson("/api/invoices/{$first->id}/send")->assertOk()
            ->assertJsonPath('data.reference_number', 'FA-2026-00001');

        // Un brouillon payé directement vaut émission.
        Sanctum::actingAs($adminA);
        $paidDraft = $this->draftOf($a, $customerA);
        $this->postJson("/api/invoices/{$paidDraft->id}/mark-paid")->assertOk()
            ->assertJsonPath('data.reference_number', 'FA-2026-00004');

        // Une facture déjà émise ne se renumérote pas.
        $this->postJson("/api/invoices/{$drafts[0]->id}/mark-paid")->assertOk()
            ->assertJsonPath('data.reference_number', 'FA-2026-00001');
    }

    public function test_ac12_the_early_termination_penalty_is_created_issued_and_numbered(): void
    {
        [$agency, $admin, $tenant] = $this->invoicingAgency();
        $this->postJsonAs($admin, $this->draftOf($agency, $tenant));
        $landlord = User::factory()->withOwnerProfile($agency)->create();
        $lease = Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'property_id' => Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id])->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
            'monthly_rent' => 400_000,
        ]);

        $lease = app(EarlyTerminationService::class)->request($lease, $landlord, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);

        $penalty = Invoice::query()->findOrFail($lease->early_termination_invoice_id);
        $this->assertSame(InvoiceStatus::Sent, $penalty->status);
        $this->assertSame('FA-2026-00002', $penalty->reference_number);
    }

    public function test_ac12_a_draft_settled_by_the_gateway_is_numbered(): void
    {
        [$agency, , $customer] = $this->invoicingAgency();
        $draft = $this->draftOf($agency, $customer, 50_000);

        $apply = new ReflectionMethod(PaymentGatewayService::class, 'applyStatusToPayment');
        $apply->invoke(app(PaymentGatewayService::class), $draft, 'success', ['amount' => 50_000]);

        $this->assertSame(InvoiceStatus::Paid, $draft->fresh()->status);
        $this->assertSame('FA-2026-00001', $draft->fresh()->reference_number);
    }

    public function test_an_invoice_without_agency_keeps_its_reference(): void
    {
        $invoice = Invoice::factory()->create(['agency_id' => null, 'customer_id' => Customer::factory()->create()->id]);
        $reference = $invoice->reference_number;

        app(InvoiceNumberAllocator::class)->allocate($invoice);

        $this->assertSame($reference, $invoice->fresh()->reference_number);
        $this->assertNull($invoice->fresh()->sequence_number);
    }

    public function test_the_year_restarts_the_sequence(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency();
        $this->postJsonAs($admin, $this->draftOf($agency, $customer));

        $this->travelTo('2027-01-02 09:00:00');
        $next = $this->draftOf($agency, $customer);
        $this->postJson("/api/invoices/{$next->id}/send")->assertOk()
            ->assertJsonPath('data.reference_number', 'FA-2027-00001');
    }

    public function test_the_counter_is_read_under_the_lock_of_the_agency_row(): void
    {
        // Deux émissions concurrentes de la même agence se sérialisent sur la ligne agence : le
        // MAX se lit APRÈS le verrou, jamais sous un verrou d'agrégat (piège PostgreSQL n° 2).
        [$agency, , $customer] = $this->invoicingAgency();
        $draft = $this->draftOf($agency, $customer);

        DB::enableQueryLog();
        app(InvoiceNumberAllocator::class)->allocate($draft);
        $queries = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        $lock = collect($queries)->search(fn (string $q): bool => str_contains($q, 'from "agencies"') && str_contains($q, 'for update'));
        $max = collect($queries)->search(fn (string $q): bool => str_contains($q, 'max("sequence_number")'));
        $this->assertNotFalse($lock, 'la ligne agence doit être verrouillée');
        $this->assertNotFalse($max);
        $this->assertLessThan($max, $lock);
        $this->assertStringNotContainsString('for update', $queries[$max]);
    }

    private function postJsonAs(User $user, Invoice $draft): void
    {
        Sanctum::actingAs($user);
        $this->postJson("/api/invoices/{$draft->id}/send")->assertOk();
    }
}
