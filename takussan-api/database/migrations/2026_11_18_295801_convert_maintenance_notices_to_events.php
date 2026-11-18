<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2958 (ADR-0128 § 3) — les avis d'intervention deviennent des `event`, et le texte d'un avis
 * devient son CODE (principe n° 5 : le front écrit le libellé dans la langue du lecteur).
 *
 * SQL pur : `MessageObserver::updating` refuse toute écriture d'un message `system` par le modèle.
 *
 *  1. Tout message `system` dont `metadata->>'event' = 'maintenance'` devient un `event` à la forme
 *     fermée `{object: {type, id}, code, data}` :
 *       - objet = la demande `metadata.maintenance_request_id`, sinon le sujet du fil
 *         (`maintenance_request`, TCK-2957), sinon `conversations.maintenance_request_id` ; sans aucun,
 *         `id` nul (la carte se relit alors « indisponible ») ;
 *       - code = `maintenance.<cause>` ; une cause absente ou hors des `MaintenanceStatusChanged::CAUSE_*`
 *         d'aujourd'hui devient `maintenance.transition` (le code de l'étape générique) ;
 *       - `data` réduit aux clés du catalogue (`status`, `from`, `provider_name`, `actor_name`) :
 *         `maintenance_request_id`, `cause` et `actor_id` ne sont pas repris.
 *  2. `content` de tout message `system` = `metadata->>'event'` (`system` à défaut), de tout `event` =
 *     son code. Messages supprimés compris.
 *  3. `conversations.last_message_preview` = le `content` du dernier message (`last_message_id`) quand
 *     celui-ci est `system` ou `event`.
 *
 * ⚠ **Cette migration EFFACE du texte** : la phrase française de chaque avis (`humanise`) n'est
 * gardée nulle part, et `down()` ne la rend pas. D'où l'action de déploiement
 * `docs/deploiement/actions/2026-11-18-sauvegarder-avant-la-conversion-des-avis.md` (sauvegarde
 * manuelle de la base avant le déploiement qui la joue).
 *
 * ⚠ **La colonne réécrite est indexée** (`Message::toSearchableArray()` lit `content`), et ces
 * messages ne sont plus indexables (`Message::shouldBeSearchable`). Une réimportation ne retire pas
 * un document devenu non indexable (`scout:import` filtre, il ne retire pas) : l'action de
 * déploiement fait jouer `php artisan messages:unindex-coded` après la migration.
 */
return new class extends Migration
{
    /** Les `MaintenanceStatusChanged::CAUSE_*` au jour de la migration (une migration ne lit pas le code vivant). */
    private const CAUSES = [
        'transition', 'assigned', 'unassigned', 'accepted', 'declined', 'quote_requested', 'quote_submitted',
        'quote_approved', 'quote_awaiting_owner', 'quote_rejected', 'completed', 'confirmed', 'contested', 'auto_closed',
    ];

    public function up(): void
    {
        $causes = "'".implode("','", self::CAUSES)."'";

        DB::statement(<<<SQL
            UPDATE messages AS m
               SET type = 'event',
                   content = conv.code,
                   metadata = jsonb_build_object(
                       'object', jsonb_build_object('type', 'maintenance_request', 'id', conv.objet),
                       'code', conv.code,
                       'data', jsonb_build_object(
                           'status', m.metadata->'status',
                           'from', m.metadata->'from',
                           'provider_name', m.metadata->'provider_name',
                           'actor_name', m.metadata->'actor_name'
                       )
                   )
              FROM (
                    SELECT mm.id,
                           'maintenance.' || CASE WHEN mm.metadata->>'cause' IN ({$causes})
                                                  THEN mm.metadata->>'cause' ELSE 'transition' END AS code,
                           COALESCE(
                               CASE WHEN mm.metadata->>'maintenance_request_id' ~ '^[0-9]+$'
                                    THEN (mm.metadata->>'maintenance_request_id')::bigint END,
                               CASE WHEN c.subject_type = 'maintenance_request' THEN c.subject_id END,
                               c.maintenance_request_id
                           ) AS objet
                      FROM messages AS mm
                      LEFT JOIN conversations AS c ON c.id = mm.conversation_id
                     WHERE mm.type = 'system'
                       AND mm.metadata->>'event' = 'maintenance'
                   ) AS conv
             WHERE m.id = conv.id
        SQL);

        DB::statement(<<<'SQL'
            UPDATE messages
               SET content = COALESCE(NULLIF(metadata->>'event', ''), 'system')
             WHERE type = 'system'
        SQL);

        DB::statement(<<<'SQL'
            UPDATE messages
               SET content = metadata->>'code'
             WHERE type = 'event'
               AND metadata->>'code' IS NOT NULL
        SQL);

        DB::statement(<<<'SQL'
            UPDATE conversations AS c
               SET last_message_preview = m.content
              FROM messages AS m
             WHERE m.id = c.last_message_id
               AND m.type IN ('system', 'event')
        SQL);
    }

    /**
     * Rend leur type et leur forme d'avis système aux événements d'intervention
     * (`{event: maintenance, maintenance_request_id, cause, …}`), ceux convertis par `up()` comme ceux
     * écrits depuis. ⚠ Le texte français effacé ne revient pas : `content` reste le code, et
     * `actor_id` (non repris par `up()`) revient nul.
     */
    public function down(): void
    {
        DB::statement(<<<'SQL'
            UPDATE messages
               SET type = 'system',
                   metadata = jsonb_build_object(
                       'event', 'maintenance',
                       'maintenance_request_id', metadata->'object'->'id',
                       'cause', substring(metadata->>'code' from 13),
                       'from', metadata->'data'->'from',
                       'status', metadata->'data'->'status',
                       'provider_name', metadata->'data'->'provider_name',
                       'actor_name', metadata->'data'->'actor_name',
                       'actor_id', NULL
                   )
             WHERE type = 'event'
               AND metadata->>'code' LIKE 'maintenance.%'
        SQL);
    }
};
