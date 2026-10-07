<?php

namespace Tests\Feature\Services;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Maintenance\MaintenanceQuoteWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class MaintenanceQuoteWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected MaintenanceQuoteWorkflow $workflow;

    protected function setUp(): void
    {
        parent::setUp();
        $this->workflow = app(MaintenanceQuoteWorkflow::class);
    }

    public function test_can_request_quote()
    {
        $mr = MaintenanceRequest::factory()->create([
            'status' => MaintenanceStatus::Open,
        ]);

        $this->workflow->requestQuote($mr);

        $this->assertEquals(MaintenanceStatus::QuoteRequested, $mr->fresh()->status);

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => MaintenanceRequest::class,
            'subject_id' => $mr->id,
            'event' => 'quote.requested',
        ]);
    }

    public function test_cannot_request_quote_from_invalid_state()
    {
        $mr = MaintenanceRequest::factory()->create([
            'status' => MaintenanceStatus::InProgress,
        ]);

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage(__('maintenance.errors.transition_not_allowed', ['from' => 'in_progress', 'to' => 'quote_requested']));

        $this->workflow->requestQuote($mr);
    }

    public function test_can_submit_quote()
    {
        $mr = MaintenanceRequest::factory()->create([
            'status' => MaintenanceStatus::QuoteRequested,
        ]);

        // TCK-592 (P12) — le montant est calculé depuis les lignes, la devise imposée (bail, sinon
        // agence, sinon XOF) : la devise envoyée n'est plus lue.
        $this->workflow->submitQuote($mr, [
            'lines' => [
                ['label' => 'Main-d\'œuvre', 'kind' => 'labour', 'quantity' => 2, 'unit_price' => 150],
                ['label' => 'Joint', 'kind' => 'supply', 'quantity' => 1, 'unit_price' => '200.00'],
            ],
            'valid_until' => now()->addWeek()->toDateString(),
        ]);

        $mr->refresh();
        $this->assertEquals(MaintenanceStatus::QuoteSubmitted, $mr->status);
        $this->assertEquals(500.00, $mr->quote_amount);
        $this->assertEquals('XOF', $mr->quote_currency);
        $this->assertNotNull($mr->quote_submitted_at);

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => MaintenanceRequest::class,
            'subject_id' => $mr->id,
            'event' => 'quote.submitted',
        ]);
    }

    public function test_can_approve_quote()
    {
        $mr = MaintenanceRequest::factory()->create([
            'status' => MaintenanceStatus::QuoteSubmitted,
        ]);

        $user = User::factory()->create();

        $this->workflow->approveQuote($mr, $user->id);

        $mr->refresh();
        $this->assertEquals(MaintenanceStatus::Approved, $mr->status);
        $this->assertEquals($user->id, $mr->quote_decision_by_id);
        $this->assertNotNull($mr->quote_decision_at);

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => MaintenanceRequest::class,
            'subject_id' => $mr->id,
            'event' => 'quote.approved',
        ]);
    }

    public function test_can_reject_quote()
    {
        $mr = MaintenanceRequest::factory()->create([
            'status' => MaintenanceStatus::QuoteSubmitted,
        ]);

        $user = User::factory()->create();

        $this->workflow->rejectQuote($mr, 'Too expensive', $user->id);

        $mr->refresh();
        $this->assertEquals(MaintenanceStatus::Rejected, $mr->status);
        $this->assertEquals($user->id, $mr->quote_decision_by_id);
        $this->assertNotNull($mr->quote_decision_at);
        $this->assertEquals('Too expensive', $mr->quote_rejection_reason);

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => MaintenanceRequest::class,
            'subject_id' => $mr->id,
            'event' => 'quote.rejected',
        ]);
    }

    public function test_can_submit_quote_again_after_rejection()
    {
        $mr = MaintenanceRequest::factory()->create([
            'status' => MaintenanceStatus::Rejected,
        ]);

        $this->workflow->submitQuote($mr, [
            'lines' => [['label' => 'Reprise', 'kind' => 'labour', 'quantity' => 1, 'unit_price' => 450]],
        ]);

        $this->assertEquals(MaintenanceStatus::QuoteSubmitted, $mr->fresh()->status);
    }

    public function test_can_start_after_approval()
    {
        $mr = MaintenanceRequest::factory()->create([
            'status' => MaintenanceStatus::Approved,
        ]);

        $this->workflow->start($mr);

        $mr->refresh();
        $this->assertEquals(MaintenanceStatus::InProgress, $mr->status);
        $this->assertNotNull($mr->started_at);

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => MaintenanceRequest::class,
            'subject_id' => $mr->id,
            'event' => 'maintenance.started',
        ]);
    }
}
