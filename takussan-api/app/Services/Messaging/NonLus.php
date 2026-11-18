<?php

namespace App\Services\Messaging;

use App\Models\Enums\MessageType;
use App\Models\User;
use Illuminate\Contracts\Database\Query\Builder;

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
            ->orWhere(fn ($evenement) => $evenement
                ->where('messages.type', MessageType::Event->value)
                ->whereRaw("messages.metadata->'".EvenementsDuFil::ACTION_FOR."' @> to_jsonb(?::bigint)", [$id])));
    }
}
