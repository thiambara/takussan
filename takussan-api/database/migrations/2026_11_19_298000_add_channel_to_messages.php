<?php

use App\Services\Pont\RegistreDesCanaux;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2980 (ADR-0132 § 0, § 1) — par où un message est arrivé : `app` (défaut, et la valeur de tout message
 * d'avant le pont), ou l'identifiant d'un pilote du pont (`whatsapp`…, {@see RegistreDesCanaux}).
 * Une chaîne libre, contrôlée par l'application (ADR-0007), jamais un `enum()` SQL : un canal neuf est une entrée
 * de `config/pont.php`, pas une migration.
 *
 * Jamais lue d'une requête : seul le pont la pose (`ConversationWriter::post`, attribut interne). Les messages
 * existants valent `app` par le défaut de la colonne, posé à l'ajout : aucune réécriture de ligne. Hors du document
 * de recherche (`Message::toSearchableArray` ne la lit pas) : aucune réimportation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->string('channel', 20)->default('app');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn('channel');
        });
    }
};
