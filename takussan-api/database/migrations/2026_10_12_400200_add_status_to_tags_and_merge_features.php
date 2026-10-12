<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (ADR-0062 §7) — les étiquettes se proposent et se modèrent, comme les quartiers ; et
 * `feature` se fond dans `amenity` : deux types disaient la même chose, et le formulaire ne
 * laissait cocher que l'un des deux.
 *
 * `string(16)` et non `enum()` (ADR-0007). Les noms d'index et de clé sont explicites (piège n°3).
 * La clé étrangère est indexée à la main (piège n°8).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tags', function (Blueprint $table) {
            $table->string('status', 16)->default('approved');
            $table->foreignId('created_by_id')->nullable()->constrained('users', 'id', 'tags_created_by_id_fk')->nullOnDelete();
            $table->index('status', 'tags_status_idx');
            $table->index('created_by_id', 'tags_created_by_id_idx');
        });

        DB::table('tags')->where('type', 'feature')->update(['type' => 'amenity', 'updated_at' => now()]);
    }

    /**
     * ⚠ La fusion `feature` → `amenity` n'est PAS défaite : rien ne dit plus, après elle, quelles
     * lignes étaient des `feature`. Le retour retire les colonnes ; les anciens `feature` restent
     * des `amenity`, ce qui est l'état que le formulaire sait afficher.
     */
    public function down(): void
    {
        Schema::table('tags', function (Blueprint $table) {
            $table->dropIndex('tags_created_by_id_idx');
            $table->dropIndex('tags_status_idx');
            $table->dropForeign('tags_created_by_id_fk');
            $table->dropColumn(['status', 'created_by_id']);
        });
    }
};
