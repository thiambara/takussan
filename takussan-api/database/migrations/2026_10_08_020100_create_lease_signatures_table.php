<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-596 §4B (ADR-0042 §3) — la preuve de consentement d'une partie à un bail : qui, pour qui,
 * quel document (empreinte), quand, d'où, par quel canal.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lease_signatures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lease_id')->constrained('leases', 'id', 'lease_signatures_lease_fk')->cascadeOnDelete();
            $table->string('role', 20);
            $table->string('method', 20);
            $table->foreignId('user_id')->nullable()->constrained('users', 'id', 'lease_signatures_user_fk')->nullOnDelete();
            $table->foreignId('on_behalf_of_user_id')->nullable()->constrained('users', 'id', 'lease_signatures_behalf_fk')->nullOnDelete();
            $table->foreignId('recorded_by_id')->nullable()->constrained('users', 'id', 'lease_signatures_recorder_fk')->nullOnDelete();
            $table->string('document_sha256', 64);
            $table->timestamp('signed_at');
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->string('otp_channel', 10)->nullable();
            $table->string('otp_destination', 120)->nullable();
            $table->timestamps();

            $table->unique(['lease_id', 'role', 'document_sha256'], 'lease_signatures_role_doc_unique');
            $table->index('user_id', 'lease_signatures_user_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lease_signatures');
    }
};
