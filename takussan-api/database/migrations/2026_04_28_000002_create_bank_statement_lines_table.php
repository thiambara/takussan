<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_statement_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bank_statement_id')->constrained('bank_statements')->cascadeOnDelete();
            $table->date('posted_at');
            $table->decimal('amount', 12, 2);
            $table->string('direction', 8);
            $table->char('currency', 3);
            $table->text('label');
            $table->string('reference')->nullable();
            $table->string('counterparty')->nullable();
            $table->json('raw_payload');
            $table->string('match_status')->default('unmatched');
            $table->string('matched_payment_type')->nullable();
            $table->unsignedBigInteger('matched_payment_id')->nullable();
            $table->unsignedTinyInteger('match_confidence')->nullable();
            $table->dateTime('confirmed_at')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['bank_statement_id', 'match_status']);
            $table->index(['matched_payment_type', 'matched_payment_id']);
            $table->index(['posted_at', 'amount']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_statement_lines');
    }
};
