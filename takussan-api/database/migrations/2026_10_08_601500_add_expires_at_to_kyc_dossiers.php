<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-601 (C, ADR-0044 §5) — l'échéance d'un dossier KYC d'agence : la plus petite échéance parmi
 * les pièces les plus récentes de chaque type (seule la pièce du dirigeant en porte une), posée à la
 * vérification. `kyc:expire-dossiers` lit `(status, expires_at)` chaque jour.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kyc_dossiers', function (Blueprint $table): void {
            $table->timestamp('expires_at')->nullable()->after('reviewed_by');
            $table->index(['status', 'expires_at'], 'kyc_dossiers_status_expires_idx');
        });
    }

    public function down(): void
    {
        Schema::table('kyc_dossiers', function (Blueprint $table): void {
            $table->dropIndex('kyc_dossiers_status_expires_idx');
            $table->dropColumn('expires_at');
        });
    }
};
