<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-602 (ADR-0051 §1) — le lien porteur d'une échéance : `/pay/{jeton}` permet à un locataire
 * SANS COMPTE de payer son échéance.
 *
 * Même stockage qu'ADR-0046 : on cherche par `token_hash` (SHA-256), on relit le clair chiffré
 * (`token`, cast `encrypted`) pour renvoyer le même lien à chaque relance. Un seul lien actif par
 * échéance : index unique PARTIEL, nommé (PostgreSQL tronque un nom auto-généré > 63 caractères).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lease_payment_links', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('lease_payment_id')->constrained('lease_payments', 'id', 'lpl_lease_payment_fk')->cascadeOnDelete();
            $table->char('token_hash', 64)->unique('lpl_token_hash_unique');
            $table->text('token');
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('last_accessed_at')->nullable();
            $table->unsignedInteger('access_count')->default(0);
            $table->foreignId('created_by_id')->nullable()->constrained('users', 'id', 'lpl_created_by_fk')->nullOnDelete();
            $table->timestamps();

            $table->index('lease_payment_id', 'lpl_lease_payment_idx');
        });

        DB::statement('CREATE UNIQUE INDEX lpl_one_active_per_payment_unique ON lease_payment_links (lease_payment_id) WHERE revoked_at IS NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('lease_payment_links');
    }
};
