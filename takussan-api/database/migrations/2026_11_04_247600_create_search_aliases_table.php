<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2476 (ADR-0088 §7) — les variantes d'écriture de la recherche (« wakam » → Ouakam, « apparts » → appartement) :
 * proposées chaque semaine par l'usage `search.variantes` à partir des recherches sans résultat, ou posées par un
 * opérateur. Une variante `active` est lue par l'analyse de la saisie (`DatabasePlaceLexicon`,
 * `DatabaseVocabularyAliases`) et par l'index des suggestions (`SuggestionIndexBuilder::withAliases()`).
 *
 * - `alias` : l'écriture, REPLIÉE (`CleDeQuartier::de()` : minuscules, sans accents, ponctuation ramenée à une espace).
 * - `target_kind` : `city` | `neighborhood` | `property_type` | `term` ; `target_value` : le nom du lieu tel que le
 *   référentiel l'écrit, la valeur de `PropertyType`, ou le terme replié du vocabulaire de l'analyse ; `target_city` : la
 *   ville d'un quartier.
 * - `origin` : `ai` | `manual` (un geste d'opérateur la fait `manual` : l'IA ne la touche plus) ;
 *   `status` : `active` | `rejected` (une variante rejetée ne revient jamais par l'IA).
 * - `evidence` : visiteurs distincts, nombre de saisies, période, confiance du modèle, appel IA.
 *
 * Chaînes et non type SQL énuméré (ADR-0007) ; `jsonb` (piège n°4).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_aliases', function (Blueprint $table) {
            $table->id();
            $table->string('alias', 80);
            $table->string('target_kind', 20);
            $table->string('target_value', 120);
            $table->string('target_city', 120)->nullable();
            $table->string('origin', 16)->default('ai');
            $table->string('status', 16)->default('active');
            $table->jsonb('evidence')->nullable();
            $table->timestamps();

            $table->unique(['alias', 'target_kind', 'target_value'], 'search_aliases_alias_target_unique');
            $table->index(['status', 'target_kind'], 'search_aliases_status_kind_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('search_aliases');
    }
};
