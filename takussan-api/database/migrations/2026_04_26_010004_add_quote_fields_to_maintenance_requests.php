<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->decimal('quote_amount', 14, 2)->nullable()->after('status');
            $table->string('quote_currency', 3)->nullable()->after('quote_amount');
            $table->timestamp('quote_submitted_at')->nullable()->after('quote_currency');
            $table->timestamp('quote_decision_at')->nullable()->after('quote_submitted_at');
            $table->foreignId('quote_decision_by_id')->nullable()->after('quote_decision_at')->constrained('users')->nullOnDelete();
            $table->text('quote_rejection_reason')->nullable()->after('quote_decision_by_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->dropForeign(['quote_decision_by_id']);
            $table->dropColumn([
                'quote_amount',
                'quote_currency',
                'quote_submitted_at',
                'quote_decision_at',
                'quote_decision_by_id',
                'quote_rejection_reason',
            ]);
        });
    }
};
