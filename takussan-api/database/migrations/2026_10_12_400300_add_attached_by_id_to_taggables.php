<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (ADR-0062 §7, D9) — qui a rattaché une étiquette à un bien.
 *
 * Le nom d'une étiquette est unique, tous types confondus : B qui tape le nom d'une proposition
 * EN ATTENTE de A retombe sur la même ligne. Elle est rattachée au bien de B (D9), mais ne sort
 * sur une fiche publique, avant modération, que là où son AUTEUR l'a rattachée
 * (`attached_by_id = tags.created_by_id`, `Tag::scopeVisiblesSurUneFiche`).
 *
 * Nullable : les liaisons existantes n'ont pas d'auteur connu — une proposition en attente qu'elles
 * portent reste masquée jusqu'à son approbation, ce qui est le sens sûr. Pas d'index : aucune
 * lecture ne part de cette colonne (piège n°8 — indexer par mesure, pas en masse).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('taggables', function (Blueprint $table) {
            $table->foreignId('attached_by_id')->nullable()->constrained('users', 'id', 'taggables_attached_by_id_fk')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('taggables', function (Blueprint $table) {
            $table->dropForeign('taggables_attached_by_id_fk');
            $table->dropColumn('attached_by_id');
        });
    }
};
