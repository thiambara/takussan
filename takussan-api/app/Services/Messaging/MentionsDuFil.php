<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;

/**
 * TCK-2966 (ADR-0128 § 6, dernier point) — les @mentions d'un fil : des identifiants de compte posés dans
 * `messages.metadata.mentions`, jamais une syntaxe dans `content` (le front écrit `@Prénom Nom` depuis les
 * participants).
 *
 * **Qui peut être mentionné** : un participant ACTIF du fil (`left_at` nul) qui LIT ce message. La personne
 * mentionnée est un TIERS (elle n'est pas l'appelant) : elle se juge comme un destinataire de notification,
 * par {@see ConversationAccess::branchesAllow()} et, pour une note d'équipe, par
 * {@see EquipeDuFil::tiersLitLesNotes()} — jamais par `ConversationAccess::allows()` ni
 * `EquipeDuFil::litLesNotes()`, qui rendent vrai pour un super-admin absent du fil et jugent le profil
 * actif de l'APPELANT.
 *
 * Cette règle se juge deux fois : à l'envoi pour le refus (`SendMessageConversationRequest`, 422
 * `messaging.mention_not_reader`), et au départ de la notification (`NotifyNewMessageJob`, qui ne prévient
 * que les mentionnés parmi les destinataires qu'il a déjà filtrés). Une mention ne crée aucun accès.
 */
final class MentionsDuFil
{
    /** Au plus dix personnes mentionnées par message. */
    public const MAX = 10;

    /** La clé du `metadata` du message. */
    public const CLE = 'mentions';

    /**
     * Les types qui portent une mention : le texte et la note vocale (le « text ou voice » du ticket ; le
     * dépôt n'a pas de type `voice`, c'est `audio`). Une pièce jointe, une carte, un événement, un avis
     * n'en portent pas.
     *
     * @return list<MessageType>
     */
    public static function types(): array
    {
        return [MessageType::Text, MessageType::Audio];
    }

    public static function typePorteUneMention(string $type): bool
    {
        return in_array($type, array_map(fn (MessageType $t): string => $t->value, self::types()), true);
    }

    /**
     * La forme stockée : des entiers uniques, triés, en LISTE (jamais un tableau à clés, que `jsonb`
     * écrirait en objet).
     *
     * @param  iterable<int|string>|null  $ids
     * @return list<int>
     */
    public static function normaliser(?iterable $ids): array
    {
        $liste = [];
        foreach ($ids ?? [] as $id) {
            $liste[] = (int) $id;
        }
        $liste = array_values(array_unique($liste));
        sort($liste);

        return $liste;
    }

    /** Les identifiants mentionnés par un message (liste vide s'il n'en porte pas). @return list<int> */
    public static function de(Message $message): array
    {
        $mentions = $message->metadata[self::CLE] ?? null;

        return is_array($mentions) ? self::normaliser($mentions) : [];
    }

    /**
     * Parmi `$ids`, ceux qui liraient un message de ce fil : participant actif, branches du fil
     * ({@see ConversationAccess::branchesAllow()}) et, pour une note, lecteur des notes en tiers.
     *
     * @param  list<int>  $ids
     * @return list<int>
     */
    public static function lecteursParmi(Conversation $fil, array $ids, bool $note): array
    {
        if ($ids === []) {
            return [];
        }

        $access = app(ConversationAccess::class);
        $agence = $note ? EquipeDuFil::agence($fil) : null;

        return User::query()
            ->whereIn('id', ConversationParticipant::query()
                ->where('conversation_id', $fil->getKey())
                ->whereNull('left_at')
                ->whereIn('user_id', $ids)
                ->select('user_id'))
            ->orderBy('id')
            ->get()
            ->filter(fn (User $u): bool => $access->branchesAllow($u, $fil)
                && (! $note || EquipeDuFil::tiersLitLesNotes($u, $fil, $agence)))
            ->map(fn (User $u): int => (int) $u->getKey())
            ->values()
            ->all();
    }
}
