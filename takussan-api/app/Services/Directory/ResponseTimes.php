<?php

namespace App\Services\Directory;

use App\Models\Enums\ConversationType;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2518 — le délai de réponse habituel d'une agence et d'un agent, tel que l'annuaire l'affiche.
 *
 * **Ce qui est mesuré.** Un fil de prospect (ADR-0068 § 1 : une conversation `direct` rattachée à
 * un bien, dont le seul écrivain est `PropertyConversationResolver::firstOrCreate()`, appelé par le
 * contact depuis la fiche publique) ; son PREMIER message écrit par le visiteur (`created_by`) ; et
 * la PREMIÈRE réponse qui le suit, écrite :
 *
 *   · pour l'agence (celle du bien) : par un de ses membres — profil d'agent ou d'admin d'agence,
 *     quel que soit son statut aujourd'hui : la réponse a été donnée au nom de l'agence ;
 *   · pour l'agent (profil d'une agence) : par lui, sur un bien de cette agence.
 *
 * Seuls comptent les fils dont le premier message du visiteur date de la fenêtre
 * (`directory.response_time.window_days`, 90 jours).
 *
 * **Un fil sans réponse compte, comme un délai infini** (décision de la revue de TCK-2518) : une
 * agence qui répond en 10 minutes à 5 fils et ignore les 95 autres ne « répond » pas « en
 * 10 minutes ». Dès que son premier message a plus de `unanswered_after_hours` (24 h), un fil sans
 * réponse entre dans le seuil ET dans la médiane, à +∞ ; plus jeune, il n'entre dans aucun des
 * deux — on ne compte pas contre l'agence un fil auquel elle a encore le temps de répondre. Si la
 * médiane tombe sur l'infini, aucune valeur : rien d'affiché plutôt qu'un chiffre flatteur.
 *
 * Pour l'agent, un fil sans réponse est le sien s'il en est participant actif (le destinataire que
 * `PropertyConversationResolver` y a mis, ou le répondant à qui le fil a été transmis) et que
 * personne de l'agence n'y a répondu ; un fil auquel un collègue a répondu ne compte pas contre lui.
 *
 * **La médiane, jamais la moyenne** (contrainte du ticket) : une réponse arrivée trois jours plus
 * tard fausse une moyenne, pas une médiane. `percentile_cont(0.5)` sur les secondes, arrondie à la
 * minute ; sous `min_conversations` fils comptés, aucune valeur — `null`, jamais affichée.
 *
 * Un message système (`sender_id` nul) n'est la réponse de personne, et un message supprimé n'est
 * plus un message.
 */
final class ResponseTimes
{
    /**
     * @return array<int, int> la médiane en minutes, par identifiant d'agence — seules les agences
     *                         au-dessus du seuil y figurent
     */
    public function parAgence(?Carbon $maintenant = null): array
    {
        [$depuis, $silence, $seuil] = $this->parametres($maintenant);

        $lignes = DB::select(
            $this->premiersMessages().',
            reponses AS (
                SELECT f.conversation_id, MIN(r.created_at) AS answered_at
                FROM premiers f
                JOIN messages r ON r.conversation_id = f.conversation_id
                    AND '.$this->reponseDeLAgence('r', 'f').'
                GROUP BY f.conversation_id
            ),
            delais AS (
                SELECT f.agency_id,
                       CASE WHEN r.answered_at IS NULL THEN \'Infinity\'::float8
                            ELSE EXTRACT(EPOCH FROM (r.answered_at - f.asked_at))::float8 END AS secondes
                FROM premiers f
                LEFT JOIN reponses r ON r.conversation_id = f.conversation_id
                WHERE r.answered_at IS NOT NULL OR f.asked_at < ?
            )
            SELECT agency_id, '.$this->medianeEnMinutes().' AS minutes
            FROM delais
            GROUP BY agency_id
            HAVING COUNT(*) >= ?',
            [ConversationType::Direct->value, $depuis, $silence, $seuil],
        );

        $medianes = [];
        foreach ($lignes as $ligne) {
            if ($ligne->minutes !== null) {
                $medianes[(int) $ligne->agency_id] = (int) $ligne->minutes;
            }
        }

        return $medianes;
    }

    /**
     * @return array<string, int> la médiane en minutes, par clé `"<agency_id>:<user_id>"` du profil
     *                            d'agent — seuls les profils au-dessus du seuil y figurent
     */
    public function parAgent(?Carbon $maintenant = null): array
    {
        [$depuis, $silence, $seuil] = $this->parametres($maintenant);

        $lignes = DB::select(
            $this->premiersMessages().',
            reponses AS (
                SELECT f.agency_id, r.sender_id AS user_id, f.asked_at, MIN(r.created_at) AS answered_at
                FROM premiers f
                JOIN messages r ON r.conversation_id = f.conversation_id
                    AND '.$this->reponseDeLAgence('r', 'f').'
                WHERE EXISTS (SELECT 1 FROM agent_profiles ap WHERE ap.user_id = r.sender_id AND ap.agency_id = f.agency_id)
                GROUP BY f.conversation_id, f.agency_id, r.sender_id, f.asked_at
            ),
            silences AS (
                SELECT f.agency_id, cp.user_id
                FROM premiers f
                JOIN conversation_participants cp ON cp.conversation_id = f.conversation_id
                    AND cp.left_at IS NULL
                    AND cp.user_id <> f.created_by
                WHERE f.asked_at < ?
                  AND EXISTS (SELECT 1 FROM agent_profiles ap WHERE ap.user_id = cp.user_id AND ap.agency_id = f.agency_id)
                  AND NOT EXISTS (SELECT 1 FROM messages r WHERE r.conversation_id = f.conversation_id AND '.$this->reponseDeLAgence('r', 'f').')
            ),
            delais AS (
                SELECT agency_id, user_id, EXTRACT(EPOCH FROM (answered_at - asked_at))::float8 AS secondes FROM reponses
                UNION ALL
                SELECT agency_id, user_id, \'Infinity\'::float8 FROM silences
            )
            SELECT agency_id, user_id, '.$this->medianeEnMinutes().' AS minutes
            FROM delais
            GROUP BY agency_id, user_id
            HAVING COUNT(*) >= ?',
            [ConversationType::Direct->value, $depuis, $silence, $seuil],
        );

        $medianes = [];
        foreach ($lignes as $ligne) {
            if ($ligne->minutes !== null) {
                $medianes[$ligne->agency_id.':'.$ligne->user_id] = (int) $ligne->minutes;
            }
        }

        return $medianes;
    }

    /** Le premier message du visiteur de chaque fil de prospect de la fenêtre, et l'agence du bien. */
    private function premiersMessages(): string
    {
        return 'WITH premiers AS (
                SELECT c.id AS conversation_id, p.agency_id, c.created_by, MIN(m.created_at) AS asked_at
                FROM conversations c
                JOIN properties p ON p.id = c.property_id
                JOIN messages m ON m.conversation_id = c.id
                    AND m.sender_id = c.created_by
                    AND m.deleted_at IS NULL
                WHERE c.type = ?
                  AND c.property_id IS NOT NULL
                  AND c.deleted_at IS NULL
                  AND p.agency_id IS NOT NULL
                GROUP BY c.id, p.agency_id, c.created_by
                HAVING MIN(m.created_at) >= ?
            )';
    }

    /**
     * Un message `r` est une réponse de l'agence au fil `f` : écrit par une personne (un avis système
     * n'est la réponse de personne), autre que le visiteur, APRÈS son premier message (un message
     * de l'agence posé avant n'est pas une réponse), par un membre de l'agence du bien — profil
     * d'agent ou d'admin d'agence.
     */
    private function reponseDeLAgence(string $r, string $f): string
    {
        return "{$r}.deleted_at IS NULL
                    AND {$r}.sender_id IS NOT NULL
                    AND {$r}.sender_id <> {$f}.created_by
                    AND {$r}.created_at > {$f}.asked_at
                    AND (EXISTS (SELECT 1 FROM agent_profiles ap WHERE ap.user_id = {$r}.sender_id AND ap.agency_id = {$f}.agency_id)
                      OR EXISTS (SELECT 1 FROM agency_admin_profiles aa WHERE aa.user_id = {$r}.sender_id AND aa.agency_id = {$f}.agency_id))";
    }

    /**
     * La médiane des `secondes` de `delais`, en minutes arrondies — `NULL` quand elle tombe sur
     * l'infini. `percentile_cont` interpole entre les deux valeurs du milieu : une seule infinie
     * suffit à rendre `Infinity` (ou `NaN` entre deux infinies), et `NaN` se range au-dessus de
     * `Infinity` sous PostgreSQL : `< 'Infinity'` ne laisse passer qu'une médiane finie.
     */
    private function medianeEnMinutes(): string
    {
        return "CASE WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY secondes) < 'Infinity'::float8
                     THEN ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY secondes) / 60) END";
    }

    /** @return array{0: Carbon, 1: Carbon, 2: int} début de la fenêtre, borne du silence, seuil */
    private function parametres(?Carbon $maintenant): array
    {
        $maintenant ??= now();

        return [
            $maintenant->copy()->subDays((int) config('directory.response_time.window_days', 90)),
            $maintenant->copy()->subHours((int) config('directory.response_time.unanswered_after_hours', 24)),
            max(1, (int) config('directory.response_time.min_conversations', 5)),
        ];
    }
}
