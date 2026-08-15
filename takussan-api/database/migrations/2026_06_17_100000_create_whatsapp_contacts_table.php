<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-282 — WhatsApp contact registry. Identified by E.164 phone, carries
 * consent (opt-in/opt-out) and the base of Meta's 24h service window
 * (`last_inbound_at`). Designed to serve both the outbound channel (user
 * registered → user_id set) and, later, inbound mise-en-relation (anonymous
 * tenant → user_id null). See models-spec §54.
 *
 * `opt_in_status` is a string + application-level check (no enum() — MySQL
 * gotcha, see CLAUDE.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_contacts', function (Blueprint $table) {
            $table->id();
            $table->string('phone')->unique();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('display_name')->nullable();
            $table->string('opt_in_status')->default('pending');
            $table->string('opt_in_source')->nullable();
            $table->dateTime('opt_in_at')->nullable();
            $table->dateTime('last_inbound_at')->nullable();
            $table->dateTime('opted_out_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_contacts');
    }
};
