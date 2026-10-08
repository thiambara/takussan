<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-589 (ADR-0033) — une invitation peut s'adresser à un NUMÉRO : le lien part
 * par SMS quand l'e-mail manque (drapeau `auth.phone_login.enabled`).
 *
 *  - `phone` (E.164, nullable) ; `email` devient nullable ;
 *  - `invitations_email_or_phone_check` : au moins un destinataire ;
 *  - `invitations_phone_status_idx` : le dédoublonnage par numéro
 *    (`InvitationService::liveSlotOccupant`) et la relance le lisent.
 *
 * `down()` échoue tant qu'une invitation sans e-mail existe : le retour en arrière
 * ne supprime pas d'invitations.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->string('phone', 30)->nullable()->after('email');
            $table->index(['phone', 'status'], 'invitations_phone_status_idx');
        });

        DB::statement('ALTER TABLE invitations ALTER COLUMN email DROP NOT NULL');
        DB::statement(
            'ALTER TABLE invitations ADD CONSTRAINT invitations_email_or_phone_check '
            .'CHECK (email IS NOT NULL OR phone IS NOT NULL)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_email_or_phone_check');
        DB::statement('ALTER TABLE invitations ALTER COLUMN email SET NOT NULL');

        Schema::table('invitations', function (Blueprint $table) {
            $table->dropIndex('invitations_phone_status_idx');
            $table->dropColumn('phone');
        });
    }
};
