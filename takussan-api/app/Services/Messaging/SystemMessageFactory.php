<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Message;
use App\Models\User;

/**
 * TCK-085 — Builds the immutable system messages that surface inside a
 * group conversation thread when a participant is added / removed,
 * promoted / demoted, or the conversation is renamed.
 *
 * Stored as `Message.type = system` with `metadata.event` ∈
 *  - participant_added
 *  - participant_removed
 *  - role_changed
 *  - renamed
 *
 * `sender_id` is null for system messages — these have no human author.
 *
 * TCK-2958 (ADR-0128 § 3) — `content` = le code de l'avis (`participant_added`…), plus jamais une
 * phrase française (`humanise` est retiré). Les avis d'intervention ne sont plus des avis système :
 * ce sont des messages `event` sur la demande, écrits par `EvenementsDuFil`.
 * The frontend renders them inline as neutral lines (see
 * `<SystemMessageBubble>`).
 */
class SystemMessageFactory
{
    public const EVENT_PARTICIPANT_ADDED = 'participant_added';

    public const EVENT_PARTICIPANT_REMOVED = 'participant_removed';

    public const EVENT_ROLE_CHANGED = 'role_changed';

    public const EVENT_RENAMED = 'renamed';

    public const EVENTS = [
        self::EVENT_PARTICIPANT_ADDED,
        self::EVENT_PARTICIPANT_REMOVED,
        self::EVENT_ROLE_CHANGED,
        self::EVENT_RENAMED,
    ];

    /**
     * TCK-2980 (ADR-0132 § 3) — les avis du pont, des CODES, écrits en `visibility = team` : seul le personnel de
     * l'agence du fil les lit (un autre client du fil n'apprend rien du canal d'un participant). `metadata` ne porte
     * que des identifiants et des codes (le compte, le type de média), jamais un numéro. TCK-2981 ajoute
     * `pont.accord` et `pont.numero_deja_a_un_compte`.
     */
    public const AVIS_PONT_STOP = 'pont.stop';

    public const AVIS_PONT_START = 'pont.start';

    public const AVIS_PONT_MEDIA_NON_RELAYE = 'pont.media_non_relaye';

    /** TCK-2981 (ADR-0132 § 3) — l'accord donné (équipe seule). */
    public const AVIS_PONT_ACCORD = 'pont.accord';

    /** TCK-2981 (ADR-0132 § 2) — l'accord d'une fiche refusé : son numéro est porté par un autre compte. */
    public const AVIS_PONT_NUMERO_DEJA_A_UN_COMPTE = 'pont.numero_deja_a_un_compte';

    public const AVIS_DU_PONT = [
        self::AVIS_PONT_STOP => ['user_id', 'channel'],
        self::AVIS_PONT_START => ['user_id', 'channel'],
        self::AVIS_PONT_MEDIA_NON_RELAYE => ['user_id', 'channel', 'media'],
        // TCK-2981 — l'accord, et le numéro déjà porté par un autre compte (fiche sans compte).
        self::AVIS_PONT_ACCORD => ['user_id', 'channel'],
        self::AVIS_PONT_NUMERO_DEJA_A_UN_COMPTE => ['channel'],
    ];

    /**
     * TCK-2980 — un avis du pont dans `$conversation`, en note d'équipe. Les clés de `$metadata` hors du catalogue
     * {@see self::AVIS_DU_PONT} sont refusées (un numéro ne s'y glisse pas).
     *
     * @param  array<string, int|string|null>  $metadata
     */
    public function avisDuPont(Conversation $conversation, string $code, array $metadata): Message
    {
        $admises = self::AVIS_DU_PONT[$code] ?? null;
        if ($admises === null || array_diff(array_keys($metadata), $admises) !== []) {
            throw new \LogicException("Avis du pont hors catalogue : {$code}.");
        }

        return $this->emit($conversation, $code, $metadata, MessageVisibility::Team);
    }

    public function participantAdded(Conversation $conversation, User $actor, User $target): Message
    {
        return $this->emit($conversation, self::EVENT_PARTICIPANT_ADDED, [
            'actor_id' => $actor->id,
            'actor_name' => $this->displayName($actor),
            'target_id' => $target->id,
            'target_name' => $this->displayName($target),
        ]);
    }

    public function participantRemoved(Conversation $conversation, ?User $actor, User $target): Message
    {
        return $this->emit($conversation, self::EVENT_PARTICIPANT_REMOVED, [
            'actor_id' => $actor?->id,
            'actor_name' => $actor ? $this->displayName($actor) : null,
            'target_id' => $target->id,
            'target_name' => $this->displayName($target),
            // self-leave is a participant_removed where actor === target
            'self_leave' => $actor && $actor->id === $target->id,
        ]);
    }

    public function roleChanged(Conversation $conversation, User $actor, User $target, string $role): Message
    {
        return $this->emit($conversation, self::EVENT_ROLE_CHANGED, [
            'actor_id' => $actor->id,
            'actor_name' => $this->displayName($actor),
            'target_id' => $target->id,
            'target_name' => $this->displayName($target),
            'role' => $role,
        ]);
    }

    public function renamed(Conversation $conversation, User $actor, ?string $oldSubject, ?string $newSubject): Message
    {
        return $this->emit($conversation, self::EVENT_RENAMED, [
            'actor_id' => $actor->id,
            'actor_name' => $this->displayName($actor),
            'old_subject' => $oldSubject,
            'new_subject' => $newSubject,
        ]);
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    protected function emit(Conversation $conversation, string $event, array $metadata, MessageVisibility $visibility = MessageVisibility::All): Message
    {
        return Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => null,
            'type' => MessageType::System->value,
            // TCK-2958 (ADR-0128 § 3, principe n° 5) — `content` est le CODE de l'avis, jamais un texte :
            // le front compose le libellé dans la langue du lecteur, et l'aperçu commun de la liste
            // (`MessageObserver::created`) ne porte plus de français.
            'content' => $event,
            'metadata' => array_merge(['event' => $event], $metadata),
            // TCK-2980 — `team` pour un avis du pont seulement ({@see self::avisDuPont()}).
            'visibility' => $visibility->value,
        ]);
    }

    /**
     * P193.05 (TCK-2053) — le nom montré aux autres membres : `nameWithoutContact()` (nom, puis
     * `username`, puis « — »), jamais l'e-mail ni `#id`.
     */
    protected function displayName(User $user): string
    {
        return $user->nameWithoutContact();
    }
}
