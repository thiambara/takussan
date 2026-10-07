<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §6) — les destinations de paiement d'un utilisateur (mobile money, virement).
 *
 * `account_identifier` et `account_holder_name` sont des `text` : ils reçoivent le cast `encrypted`
 * (le chiffré d'un numéro de 9 chiffres dépasse largement 255 caractères). `masked_identifier` est
 * la seule forme que l'agence lit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payout_methods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users', 'id', 'payout_methods_user_fk')->cascadeOnDelete();
            $table->string('kind', 30);
            $table->text('account_identifier');
            $table->text('account_holder_name')->nullable();
            $table->string('masked_identifier', 40);
            $table->boolean('is_default')->default(false);
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by_id')->nullable()->constrained('users', 'id', 'payout_methods_verified_by_fk')->nullOnDelete();
            $table->softDeletes();
            $table->timestamps();

            $table->index('user_id', 'payout_methods_user_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payout_methods');
    }
};
