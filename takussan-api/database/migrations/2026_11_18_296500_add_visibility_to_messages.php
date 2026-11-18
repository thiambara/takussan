<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2965 (ADR-0128 § 6) — la note d'équipe : `messages.visibility`, `all` (défaut) ou `team`
 * (`App\Models\Enums\MessageVisibility`). Une chaîne et non un `enum()` SQL (ADR-0007). Les messages
 * existants valent `all` par le défaut de la colonne, posé à l'ajout : aucune réécriture de ligne.
 *
 * L'index sert le filtre de la page des messages d'un fil (`ConversationAccess::messagesLisiblesPar`) :
 * `conversation_id = ? AND visibility = 'all'`, puis le curseur `before_id` / `after_id`. Nommé
 * explicitement (piège n° 3 : un nom tronqué à 63 caractères ne se retrouve plus).
 *
 * ⚠ La colonne entre dans le document de recherche (`Message::toSearchableArray`) : le modèle et
 * `config/scout.php` changent l'empreinte `.search-shape`, et `docker/release.sh` réimporte donc tous
 * les index au déploiement. Aucune action manuelle (relevé du 2026-11-18, TCK-2965).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->string('visibility', 10)->default('all');
            $table->index(['conversation_id', 'visibility', 'id'], 'messages_conversation_visibility_idx');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex('messages_conversation_visibility_idx');
            $table->dropColumn('visibility');
        });
    }
};
