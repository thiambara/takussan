<?php

namespace App\Services\Messaging;

use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use Illuminate\Contracts\Database\Query\Builder;
use LogicException;

/**
 * TCK-2959 (ADR-0128 § 5) — LA définition de « quels messages comptent comme non lus pour ce
 * lecteur », hors curseur de lecture. Elle était écrite deux fois (`$nonLus` de
 * `ConversationController::index` et sa copie dans `markAsUnread`) ; les deux l'appellent ici, et
 * chacun garde son curseur (`last_read_at < created_at` pour la liste, le dernier message pour
 * `markAsUnread`).
 *
 * Compte, pour le lecteur :
 *  - un message d'un AUTRE (ou sans auteur), hors avis `system` et hors `event` — la règle d'avant,
 *    inchangée pour `text`, `image`, `document`, `audio` et `card` ; un message supprimé sort par la
 *    portée `SoftDeletes` de `Message` ;
 *  - un `event` si et seulement si le lecteur figure dans son `metadata.action_for` (contenance
 *    `jsonb`). Un `event` sans `action_for`, ou à liste vide (les avis d'intervention convertis par
 *    TCK-2958), ne compte pour personne.
 *
 * Toutes les colonnes sont qualifiées `messages.` et la règle est posée dans UN `where` groupé : elle
 * s'applique telle quelle sous `withCount`, `whereHas('messages', …)` et `Message::query()`, sans
 * qu'un `or` échappe à la corrélation de la relation.
 */
final class NonLus
{
    /**
     * @template T of Builder
     *
     * @param  T  $messages  une requête sur `messages`
     * @return T
     */
    public static function comptentPour(Builder $messages, User|int $lecteur): Builder
    {
        $id = $lecteur instanceof User ? (int) $lecteur->getKey() : $lecteur;

        return $messages->where(fn ($regle) => $regle
            ->where(fn ($autre) => $autre
                ->whereNotIn('messages.type', [MessageType::System->value, MessageType::Event->value])
                ->where(fn ($w) => $w->whereNull('messages.sender_id')->orWhere('messages.sender_id', '!=', $id)))
            ->orWhere(fn ($evenement) => self::gesteToujoursAttendu($evenement, $id)));
    }

    /**
     * TCK-2961 — les `event` dont le lecteur est attendu ET pas dépassés : la branche `event` de
     * {@see self::comptentPour()}, et ce qui rend `action_attendue` ({@see self::attendusParmi()}).
     *
     * Un `event` est DÉPASSÉ quand le même fil porte, sur le même objet (`metadata.object`, égalité
     * `jsonb`), un `event` POSTÉRIEUR (`id` plus grand : `created_at` est à la seconde) qui :
     *
     * (a) **attend lui aussi CE lecteur** (TCK-2961) : un loyer impayé écrit `due_soon`, puis chaque jalon
     *     `overdue`, puis `reminded`, tous à l'adresse du locataire — seul le dernier l'attend. Jugé par
     *     lecteur : un événement postérieur qui attend D'AUTRES ne retire rien au lecteur — le prestataire,
     *     attendu sur `slot_requested`, le reste quand un `quote_submitted` postérieur n'attend que qui
     *     décide du devis. Revers assumé : deux gestes DIFFÉRENTS d'un même objet, attendus du même lecteur,
     *     se périment l'un l'autre ;
     * (b) **porte un code qui clôt le sien** (TCK-2967, `eteint` de {@see CodesDuFil}) : `lease_payment.paid`,
     *     dont `action_for` est vide, clôt `due_soon`, `overdue` et `reminded` — le locataire qui a payé
     *     n'est plus attendu, ni en non-lu, ni dans la boîte (`FileDuFil`).
     *
     * La liste « code → codes éteints » devient UNE clause SQL (couples en littéraux) : une requête par page,
     * jamais une par message. `metadata` est immuable (`MessageObserver`) : la règle se juge à la lecture,
     * jamais par réécriture des anciens messages.
     *
     * @template T of Builder
     *
     * @param  T  $messages
     * @return T
     */
    public static function gesteToujoursAttendu(Builder $messages, int $lecteur): Builder
    {
        return self::gesteAttenduDe($messages, '?::bigint', [$lecteur]);
    }

    /**
     * TCK-2967 (ADR-0128 § 7) — la même règle, pour un lecteur désigné par une COLONNE de la requête
     * englobante (`autre.user_id`) : la boîte de pilotage cherche les événements qui attendent encore un
     * AUTRE participant que le lecteur. Une seule écriture de la règle du dépassement.
     *
     * @template T of Builder
     *
     * @param  T  $messages
     * @param  string  $colonne  une colonne qualifiée, jamais une saisie
     * @return T
     */
    public static function gesteToujoursAttenduDeLaColonne(Builder $messages, string $colonne): Builder
    {
        return self::gesteAttenduDe($messages, $colonne, []);
    }

    /**
     * @template T of Builder
     *
     * @param  T  $messages
     * @param  list<int>  $liaisons
     * @return T
     */
    private static function gesteAttenduDe(Builder $messages, string $lecteurSql, array $liaisons): Builder
    {
        $contient = "->'".EvenementsDuFil::ACTION_FOR."' @> to_jsonb({$lecteurSql})";

        return $messages
            ->where('messages.type', MessageType::Event->value)
            ->whereRaw('messages.metadata'.$contient, $liaisons)
            ->whereNotExists(fn ($suivant) => $suivant->selectRaw('1')
                ->from('messages as suivant')
                ->whereColumn('suivant.conversation_id', 'messages.conversation_id')
                ->whereColumn('suivant.id', '>', 'messages.id')
                ->where('suivant.type', MessageType::Event->value)
                ->whereNull('suivant.deleted_at')
                ->whereRaw("suivant.metadata->'object' = messages.metadata->'object'")
                // (a) TCK-2961 — il attend lui aussi ce lecteur ; (b) TCK-2967 — son code clôt le précédent.
                ->where(fn ($depasse) => $depasse
                    ->whereRaw('suivant.metadata'.$contient, $liaisons)
                    ->orWhereRaw(self::clotureSql())));
    }

    /**
     * TCK-2967 — `(code de l'événement, code du suivant)` parmi les couples déclarés par le catalogue
     * ({@see CodesDuFil::clotures()}). Des littéraux, non des liaisons : des constantes du programme,
     * vérifiées une à une (la clause garde le même texte, et son plan, à chaque page).
     */
    private static function clotureSql(): string
    {
        $couples = [];
        foreach (CodesDuFil::clotures() as [$eteint, $parCode]) {
            foreach ([$eteint, $parCode] as $code) {
                if (preg_match('/^[a-z_]+\.[a-z_]+$/', $code) !== 1) {
                    throw new LogicException("Code du fil impropre à une clause : « {$code} ».");
                }
            }
            $couples[] = "('{$eteint}', '{$parCode}')";
        }
        if ($couples === []) {
            return 'false';
        }

        return "(messages.metadata->>'code', suivant.metadata->>'code') IN (".implode(', ', $couples).')';
    }

    /**
     * TCK-2961 — parmi `$evenements` (les `event` d'une page), les identifiants de ceux qui attendent
     * encore `$lecteur` : UNE requête par page, jamais une par message.
     *
     * @param  iterable<int>  $evenements
     * @return array<int, true>
     */
    public static function attendusParmi(iterable $evenements, User|int $lecteur): array
    {
        $ids = [];
        foreach ($evenements as $id) {
            $ids[] = (int) $id;
        }
        if ($ids === []) {
            return [];
        }
        $id = $lecteur instanceof User ? (int) $lecteur->getKey() : $lecteur;

        return Message::query()
            ->whereIn('messages.id', $ids)
            ->where(fn ($q) => self::gesteToujoursAttendu($q, $id))
            ->pluck('messages.id')
            ->mapWithKeys(fn ($messageId) => [(int) $messageId => true])
            ->all();
    }
}
