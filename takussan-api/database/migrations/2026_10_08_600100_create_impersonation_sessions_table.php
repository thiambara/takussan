<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-600 (ADR-0055) — une session d'impersonation : qui, qui, pourquoi, jusqu'à quand, et comment
 * elle a fini. Le jeton Sanctum dédié (`impersonation:read`) y est rattaché ; sa suppression (fin de
 * session) laisse la ligne, pour l'audit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('impersonation_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('impersonator_id')->constrained('users', 'id', 'imp_sessions_impersonator_fk')->cascadeOnDelete();
            $table->foreignId('target_user_id')->constrained('users', 'id', 'imp_sessions_target_fk')->cascadeOnDelete();
            $table->foreignId('personal_access_token_id')->nullable()
                ->unique('imp_sessions_token_uniq')
                ->constrained('personal_access_tokens', 'id', 'imp_sessions_token_fk')->nullOnDelete();
            $table->text('reason');
            $table->timestamp('started_at');
            $table->timestamp('expires_at');
            $table->timestamp('ended_at')->nullable();
            // Pas d'`enum()` (ADR-0007) : `App\Models\Enums\ImpersonationEndReason`.
            $table->string('end_reason', 20)->nullable();
            $table->timestamps();

            $table->index(['impersonator_id', 'ended_at'], 'imp_sessions_open_idx');
            $table->index(['ended_at', 'expires_at'], 'imp_sessions_expiry_idx');
            // Piège n° 8 : la clé étrangère n'est pas indexée d'office — les sessions qui visent un
            // compte se ferment quand il est bloqué.
            $table->index('target_user_id', 'imp_sessions_target_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('impersonation_sessions');
    }
};
