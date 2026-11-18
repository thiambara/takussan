<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * TCK-2958 (ADR-0128 § 3) — le SEUL code qui crée un message `card` ou `event`.
 *
 * Le `metadata` a une forme fermée : `{object: {type, id}, code, data}`. Le message garde une
 * référence et un code, jamais une copie de l'objet : son contenu est relu à l'affichage, pour chaque
 * lecteur ({@see ObjetsDesMessages}). `content` = le code (neutre ; le front écrit le libellé).
 *
 * Refuse, par exception de logique (une erreur de programme, jamais une saisie) : un objet hors du
 * registre ({@see SujetsDuFil}), un code hors du catalogue ({@see CodesDuFil}), un code d'une autre
 * nature, un type d'objet qui ne va pas avec le code, une clé de `data` que le code n'admet pas, et
 * une valeur de `data` qui n'est pas scalaire (un tableau ferait passer une copie de l'objet).
 *
 * Un événement n'a pas d'auteur (`sender_id = null`) et ne déclenche aucune notification de nouveau
 * message : l'objet prévient déjà par ses propres canaux. Une carte posée par un participant
 * (TCK-2964) suit le chemin ordinaire de {@see ConversationWriter} (droit d'écrire, pointeur du fil,
 * notification).
 */
class EvenementsDuFil
{
    public function __construct(private readonly ConversationWriter $writer) {}

    /**
     * L'événement `$code` de `$objet` dans `$conversation`.
     *
     * @param  array<string, scalar|null>  $data
     */
    public function ecrire(Conversation $conversation, Model $objet, string $code, array $data = []): Message
    {
        $metadata = self::metadata($objet, $code, $data, CodesDuFil::NATURE_EVENEMENT);

        // `Message::create` : `MessageObserver::created` écrit le pointeur et l'aperçu (= le code).
        return Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => null,
            'type' => MessageType::Event->value,
            'content' => $code,
            'metadata' => $metadata,
        ]);
    }

    /**
     * La carte `$code` de `$objet`, posée par `$auteur` (TCK-2964 l'appelle depuis sa route).
     *
     * @param  array<string, scalar|null>  $data
     */
    public function carte(Conversation $conversation, User $auteur, Model $objet, string $code, array $data = []): Message
    {
        $metadata = self::metadata($objet, $code, $data, CodesDuFil::NATURE_CARTE);

        return $this->writer->post($auteur, $conversation, [
            'content' => $code,
            'type' => MessageType::Card->value,
            'metadata' => $metadata,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{object: array{type: string, id: int}, code: string, data: array<string, scalar|null>}
     */
    private static function metadata(Model $objet, string $code, array $data, string $nature): array
    {
        $type = SujetsDuFil::typeDe($objet);
        $entree = CodesDuFil::entree($code);

        if ($entree['nature'] !== $nature) {
            throw new LogicException("Le code « {$code} » est de nature « {$entree['nature']} », pas « {$nature} ».");
        }
        if ($entree['objet'] !== $type) {
            throw new LogicException("Le code « {$code} » porte sur « {$entree['objet']} », pas sur « {$type} ».");
        }
        $enTrop = array_diff(array_keys($data), $entree['data']);
        if ($enTrop !== []) {
            throw new LogicException("Clés de data refusées pour « {$code} » : ".implode(', ', $enTrop).'.');
        }
        foreach ($data as $cle => $valeur) {
            if ($valeur !== null && ! is_scalar($valeur)) {
                throw new LogicException("La clé « {$cle} » de « {$code} » n'est pas une valeur simple.");
            }
        }

        return [
            'object' => ['type' => $type, 'id' => (int) $objet->getKey()],
            'code' => $code,
            'data' => $data,
        ];
    }
}
