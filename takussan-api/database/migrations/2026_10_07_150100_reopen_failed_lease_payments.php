<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-593 — un échec de paiement en ligne ne change plus l'état du loyer.
 *
 * Jusqu'ici un webhook ou un `verify` en échec écrivait `status = failed` sur l'échéance, et
 * `failed` n'était lu comme « ouvert » nulle part : plus de pénalité, plus de relance, plus de
 * `mark-paid` manuel (422). Les lignes déjà `failed` repassent `pending`, marquées par
 * `metadata.reopened_from_failed_at` ; le calculateur de pénalités les reprend à 02:00 s'il y a lieu.
 *
 * `down()` ne restaure que les lignes MARQUÉES et restées `pending` : une échéance rouverte puis
 * payée depuis ne redevient pas `failed`. Le marqueur est retiré de toutes les lignes marquées.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('lease_payments')
            ->where('status', 'failed')
            ->update([
                'status' => 'pending',
                'metadata' => DB::raw(
                    "jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reopened_from_failed_at}', to_jsonb(now()::text))"
                ),
            ]);
    }

    public function down(): void
    {
        DB::table('lease_payments')
            ->whereNotNull('metadata->reopened_from_failed_at')
            ->where('status', 'pending')
            ->update(['status' => 'failed']);

        DB::table('lease_payments')
            ->whereNotNull('metadata->reopened_from_failed_at')
            ->update(['metadata' => DB::raw("metadata - 'reopened_from_failed_at'")]);
    }
};
