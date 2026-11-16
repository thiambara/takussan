<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2576 (décision du porteur, 2026-11-16, option a) — le numéro WhatsApp de l'AGENCE, saisi par
 * qui configure l'agence dans sa fiche (`/app/agency`). Jamais le numéro personnel de l'admin :
 * la fiche publique de l'agence n'offre WhatsApp que si ce numéro est déclaré ici.
 *
 * Une chaîne et non un booléen (contrairement à `users.phone_whatsapp`) : `agencies.phone` est un
 * texte libre (la ligne du bureau, souvent un fixe), et le numéro WhatsApp d'une agence est le plus
 * souvent un mobile distinct. Normalisé en E.164 à la saisie (`TelephoneSaisi`). Additive, nulle.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->string('phone_whatsapp', 30)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn('phone_whatsapp');
        });
    }
};
