<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2658 (ADR-0105 § 2) — les relances d'impayés NOTÉES par l'agence. Lues par échéance, de la
 * plus récente à la plus ancienne : index `(lease_payment_id, created_at)` ; listées par agence :
 * index `(agency_id, created_at)` (AgencyIdIsIndexedTest).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lease_payment_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->foreignId('lease_payment_id')->constrained('lease_payments')->cascadeOnDelete();
            $table->string('channel', 20);
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('note')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['lease_payment_id', 'created_at']);
            $table->index(['agency_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lease_payment_reminders');
    }
};
