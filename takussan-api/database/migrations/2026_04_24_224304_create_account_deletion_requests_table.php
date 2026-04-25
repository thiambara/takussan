<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-080 — RGPD account deletion request lifecycle.
 *
 * `user_id` is unique: a user can only have one pending request at a time.
 * The request row is purged on cancellation; on execution we keep it as an
 * audit breadcrumb (`executed_at` set, the FK becomes nullable so the user
 * can be soft-deleted without dragging the request along).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_deletion_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->unique()
                ->constrained('users')
                ->cascadeOnDelete();
            $table->timestamp('requested_at');
            $table->timestamp('scheduled_for')->index();
            $table->text('reason')->nullable();
            $table->string('reason_code', 64)->nullable();
            $table->timestamp('executed_at')->nullable();
            $table->timestamp('reminder_sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_deletion_requests');
    }
};
