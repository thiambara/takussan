<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-266 — `tenant_onboarding_checklists` table.
 *
 * Suit la complétion de l'onboarding "Espace résident" déclenché à la
 * signature d'un bail (`Lease.activated`). Une seule ligne par bail
 * (unique `lease_id`) — la création est idempotente côté service via
 * `firstOrCreate`. Les quatre items (`welcome_seen`, `inventory_completed`,
 * `first_payment`, `documents_acknowledged`) sont des datetimes nullable.
 * `completed_at` est posé quand `inventory_completed_at` ET `first_payment_at`
 * sont set (les deux autres sont informatifs — cf. `docs/models-spec.md#50`).
 *
 * `reminders_sent` est un tableau JSON d'entrées
 * `{type: 'inventory_d7', sent_at: ISO}` consommé par le cron horaire
 * `tenant-onboarding:remind` pour l'idempotence.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_onboarding_checklists', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('lease_id')
                ->unique()
                ->constrained('leases')->cascadeOnDelete();
            $table->foreignId('user_id')
                ->constrained('users')->cascadeOnDelete();

            $table->timestamp('welcome_seen_at')->nullable();
            $table->timestamp('inventory_completed_at')->nullable();
            $table->timestamp('first_payment_at')->nullable();
            $table->timestamp('documents_acknowledged_at')->nullable();

            // MySQL < 8.0.13 refuse DEFAULT sur JSON. Le default '[]' est
            // posé côté Model via $attributes (TenantOnboardingChecklist.php),
            // et la lecture est défensive via "?? []" partout.
            $table->json('reminders_sent')->nullable();

            $table->timestamp('completed_at')->nullable();

            $table->timestamps();

            // Sweep par le cron + tri "plus anciens en premier" sur la console
            // agence "/tenant-onboarding-pending".
            $table->index(['completed_at', 'created_at']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_onboarding_checklists');
    }
};
