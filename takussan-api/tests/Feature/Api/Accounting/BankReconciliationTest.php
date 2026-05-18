<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class BankReconciliationTest extends TestCase
{
    use RefreshDatabase;

    protected Agency $agency;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        app(PermissionRegistrar::class)->setPermissionsTeamId($this->agency->id);
        Role::findOrCreate('agency_admin');
        $this->admin = User::factory()->create([
            'agency_id' => $this->agency->id,
        ]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
        $this->admin->assignRole('agency_admin');
    }

    // ─── Upload / Import ─────────────────────────────────────────

    public function test_upload_bank_statement_returns_202(): void
    {
        Queue::fake();

        $file = UploadedFile::fake()->createWithContent('statement.csv', file_get_contents(
            base_path('tests/fixtures/bank/sample.csv')
        ));

        $response = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => $file,
                'source_format' => 'csv',
                'bank_name' => 'BIS',
            ]);

        $response->assertStatus(202);
        $response->assertJsonPath('data.status', 'processing');
        $response->assertJsonPath('data.agency_id', $this->agency->id);

        $this->assertDatabaseHas('bank_statements', [
            'agency_id' => $this->agency->id,
            'source_format' => 'csv',
            'status' => 'processing',
            'bank_name' => 'BIS',
        ]);
    }

    public function test_duplicate_upload_is_rejected(): void
    {
        Queue::fake();

        $content = file_get_contents(base_path('tests/fixtures/bank/sample.csv'));

        // Upload once
        $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('s1.csv', $content),
                'source_format' => 'csv',
            ]);

        // Upload again — same content
        $response = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('s2.csv', $content),
                'source_format' => 'csv',
            ]);

        $response->assertStatus(422);
    }

    // ─── List & Show ─────────────────────────────────────────────

    public function test_list_bank_statements(): void
    {
        BankStatement::factory()->count(3)->create(['agency_id' => $this->agency->id, 'uploaded_by' => $this->admin->id]);

        $response = $this->actingAs($this->admin)
            ->getJson("/api/agencies/{$this->agency->id}/bank-statements");

        $response->assertOk();
        $response->assertJsonCount(3, 'data');
    }

    public function test_show_bank_statement(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin)
            ->getJson("/api/bank-statements/{$statement->id}");

        $response->assertOk();
        $response->assertJsonPath('data.id', $statement->id);
    }

    // ─── Line Actions ────────────────────────────────────────────

    public function test_confirm_match_on_line(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'amount' => 15000,
            'currency' => 'XOF',
            'match_status' => BankStatementLineMatchStatus::Suggested,
        ]);

        $payment = LeasePayment::factory()->create([
            'amount' => 15000,
            'currency' => 'XOF',
            'bank_reconciled_at' => null,
            'bank_statement_line_id' => null,
        ]);

        // Attach the payment's lease to the agency
        $payment->lease->update(['agency_id' => $this->agency->id]);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $payment->id,
            ]);

        $response->assertOk();
        $response->assertJsonPath('data.match_status', 'confirmed');

        $this->assertDatabaseHas('lease_payments', [
            'id' => $payment->id,
            'bank_statement_line_id' => $line->id,
        ]);
    }

    public function test_ignore_line(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
        ]);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/ignore");

        $response->assertOk();
        $response->assertJsonPath('data.match_status', 'ignored');
    }

    // ─── Finalize ────────────────────────────────────────────────

    public function test_finalize_statement(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        // All lines confirmed
        BankStatementLine::factory()->count(3)->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Confirmed,
        ]);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/bank-statements/{$statement->id}/finalize");

        $response->assertOk();
        $response->assertJsonPath('data.status', 'reconciled');
    }

    public function test_finalize_with_remaining_lines_gives_partial(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Confirmed,
        ]);
        BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
        ]);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/bank-statements/{$statement->id}/finalize");

        $response->assertOk();
        $response->assertJsonPath('data.status', 'partially_reconciled');
    }
}
