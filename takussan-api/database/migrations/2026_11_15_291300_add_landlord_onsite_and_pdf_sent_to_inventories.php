<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2913 (ADR-0098, amendement du 2026-11-15) :
 *
 * - la trace de la signature du BAILLEUR, comme celle du locataire (TCK-2646) : `owner_signature_method`
 *   (`drawn` | `onsite_otp`), `owner_signed_via_user_id` (le membre du personnel qui tenait l'appareil),
 *   `owner_otp_channel`, `owner_otp_destination` (masqué), `owner_signed_ip` (ne sort jamais de l'API).
 *   Les états des lieux déjà signés par le bailleur l'ont été par un tracé : ils reçoivent `drawn` ;
 * - l'envoi du PDF aux parties à la seconde signature : `pdf_sent_at` (la réclamation de l'envoi, une
 *   seule fois) et `pdf_sent_to` (les comptes avisés).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->string('owner_signature_method', 20)->nullable()->after('owner_signature_hash');
            $table->foreignId('owner_signed_via_user_id')->nullable()->after('owner_signature_method')
                ->constrained('users', 'id', 'inventories_owner_signed_via_fk')->nullOnDelete();
            $table->string('owner_otp_channel', 10)->nullable()->after('owner_signed_via_user_id');
            $table->string('owner_otp_destination', 120)->nullable()->after('owner_otp_channel');
            $table->string('owner_signed_ip', 45)->nullable()->after('owner_otp_destination');
            $table->timestamp('pdf_sent_at')->nullable()->after('signed_at');
            $table->json('pdf_sent_to')->nullable()->after('pdf_sent_at');
        });

        DB::table('inventories')->where('owner_signed', true)->update(['owner_signature_method' => 'drawn']);
    }

    public function down(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->dropForeign('inventories_owner_signed_via_fk');
            $table->dropColumn([
                'pdf_sent_to',
                'pdf_sent_at',
                'owner_signed_ip',
                'owner_otp_destination',
                'owner_otp_channel',
                'owner_signed_via_user_id',
                'owner_signature_method',
            ]);
        });
    }
};
