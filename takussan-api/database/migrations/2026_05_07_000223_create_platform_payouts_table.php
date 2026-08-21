<?php

use App\Models\Enums\PlatformPayoutStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_payouts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('gross_amount', 14, 2)->default(0);
            $table->decimal('platform_fee_amount', 14, 2)->default(0);
            $table->decimal('net_amount', 14, 2)->default(0);
            $table->char('currency', 3)->default('XOF');
            $table->string('status')->default(PlatformPayoutStatus::Pending->value);
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('processed_at')->nullable();
            $table->text('failure_reason')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->timestamps();

            $table->index(['status']);
            $table->index(['agency_id', 'period_end']);
        });

        // One non-cancelled payout per (agency, period_end) — enforces idempotence
        // of close-period at the storage layer (matches AC: ré-exécution = 409).
        // ⚠ Plus de branchement par driver depuis ADR-0020 : il n'y a qu'un moteur.
        // La condition disait « pgsql ou sqlite », et son absence d'`else` signifiait
        // qu'aucun index n'était créé sur MySQL — l'invariant n'y était donc PAS garanti
        // en base. Ce n'était pas une équivalence entre moteurs, c'était un trou.
        DB::statement("CREATE UNIQUE INDEX platform_payouts_unique_open_period ON platform_payouts (agency_id, period_end) WHERE status <> 'cancelled'");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS platform_payouts_unique_open_period');

        Schema::dropIfExists('platform_payouts');
    }
};
