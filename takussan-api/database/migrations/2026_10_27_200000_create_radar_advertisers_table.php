<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2386 (ADR-0077 §1, §7, §9) — un annonceur du Radar : une ligne par numéro de téléphone.
 * `phone` est purgé (null) après un STOP ; `phone_hmac`, l'empreinte à clé du numéro, est ce qui
 * reste, pour que le refus survive à l'effacement du numéro en clair.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_advertisers', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 20)->nullable();
            $table->string('phone_hmac', 64);
            $table->string('display_name', 120)->nullable();
            $table->string('nature', 30)->default('unknown');
            $table->jsonb('nature_signals')->default('[]');
            $table->timestamp('do_not_contact_at')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('phone', 'radar_advertisers_phone_unique');
            $table->unique('phone_hmac', 'radar_advertisers_phone_hmac_unique');
            $table->index('user_id', 'radar_advertisers_user_id_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_advertisers');
    }
};
