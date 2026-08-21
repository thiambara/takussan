<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La table des notifications de base de Laravel — absente depuis toujours, alors que
 * 29 classes de `app/Notifications/` y écrivent.
 *
 * ─── Comment ce trou a été TROUVÉ, et pourquoi il a survécu ────────────────────────
 *
 * Il a été trouvé par la migration vers PostgreSQL (ADR-0020), et il ne pouvait pas
 * l'être autrement. Ce que le serveur journalisait, à chaque envoi :
 *
 *     ERROR:  relation "notifications" does not exist at character 13
 *
 * `Illuminate\Notifications\Channels\DatabaseChannel` insère dans `notifications`.
 * Aucune migration de ce dépôt ne la crée — `php artisan notifications:table` n'a
 * jamais été joué — et l'exception est avalée par la file de notifications. Sur SQLite
 * comme sur MySQL, une instruction ratée n'empêche pas les suivantes : la requête HTTP
 * rendait 201, le test passait, et la notification partait dans le vide. **En
 * production aussi**, si l'API avait servi.
 *
 * PostgreSQL, lui, ABANDONNE la transaction entière au premier échec
 * (« current transaction is aborted, commands ignored until end of transaction
 * block »). Comme `RefreshDatabase` enveloppe chaque test dans UNE transaction, tout
 * ce qui suivait dans le même test mourait — sur un message qui n'accusait pas le
 * coupable mais la première requête innocente venue, ici le middleware de maintenance.
 *
 * *C'est le contraire d'un inconvénient : un moteur qui refuse de continuer après une
 * erreur transforme un échec silencieux en échec bruyant.* Ce défaut vivait dans le
 * dépôt depuis l'origine et aucune des ~2300 assertions ne pouvait le voir.
 *
 * ─── ⚠ CE QUE CETTE MIGRATION NE TRANCHE PAS ──────────────────────────────────────
 *
 * Le dépôt a DÉJÀ un magasin de notifications : `app_notifications`, alimenté par
 * `App\Services\Model\NotificationService`, avec ses tentatives de remise, ses
 * préférences et ses digests. Cette table-ci en ajoute un SECOND, celui de Laravel,
 * alimenté par un chemin entièrement distinct.
 *
 * **Deux magasins pour un même objet métier est une question de PRODUIT, et elle n'est
 * pas tranchée ici.** Ce chantier fait le choix minimal et réversible : rendre vrai ce
 * que le code déclare déjà — 29 `via()` demandent explicitement le canal `database` —
 * plutôt que de retirer unilatéralement une fonctionnalité, ou de rerouter le canal
 * vers `app_notifications` sans que personne ne l'ait décidé. La question est portée
 * par son propre ticket.
 *
 * La forme de la table est celle de `php artisan notifications:table` : le canal de
 * Laravel écrit `id` (uuid), `type`, la relation morphique, `data` et `read_at`, et il
 * ne saurait pas en lire une autre.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            // `text` et non `json` : c'est le type qu'attend `DatabaseChannel`, qui
            // sérialise lui-même en JSON et cast la colonne côté modèle. Un `jsonb`
            // ici sortirait de la forme que le canal de Laravel sait relire.
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
