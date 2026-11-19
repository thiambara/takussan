<?php

namespace App\Services\Messaging;

use App\Jobs\EmettreLesLiensDAction;
use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use App\Services\Pont\GestesParLien;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use LogicException;
use Throwable;

/**
 * TCK-2958 (ADR-0128 § 3) — le SEUL code qui crée un message `card` ou `event`.
 *
 * Le `metadata` a une forme fermée : `{object: {type, id}, code, data}`, plus `action_for` pour un
 * événement (TCK-2959). Le message garde une
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
 *
 * TCK-2959 (ADR-0128 § 5) — `action_for` : la liste des comptes dont l'objet attend un geste,
 * calculée par l'appelant à l'émission, FILTRÉE ici sur les participants actifs du fil (un compte
 * absent ou parti n'y entre pas, quel que soit l'appelant). Toujours écrite pour un événement, `[]`
 * sans geste attendu ; une liste d'entiers uniques, que `NonLus` cherche par contenance `jsonb`
 * (`@>` distingue le nombre 5 de la chaîne "5"). Elle ne sort jamais telle quelle : chaque lecteur
 * reçoit son booléen ({@see self::actionAttenduePar()}), et la liste est retirée du `metadata`
 * rendu ({@see self::metadataRendu()}).
 */
class EvenementsDuFil
{
    public function __construct(private readonly ConversationWriter $writer) {}

    /** TCK-2959 — la clé du `metadata` d'un événement qui liste les comptes dont un geste est attendu. */
    public const ACTION_FOR = 'action_for';

    /**
     * L'événement `$code` de `$objet` dans `$conversation`.
     *
     * @param  array<string, scalar|null>  $data
     * @param  iterable<User|int>  $actionFor  TCK-2959 — les comptes dont l'objet attend un geste
     */
    public function ecrire(Conversation $conversation, Model $objet, string $code, array $data = [], iterable $actionFor = []): Message
    {
        $metadata = self::metadata($objet, $code, $data, CodesDuFil::NATURE_EVENEMENT);
        $metadata[self::ACTION_FOR] = self::participantsActifs($conversation, $actionFor);
        // TCK-2967 — seul un code déclaré `attend` porte un geste attendu : c'est ce qui permet au catalogue
        // de dire, pour chacun, ce qui le clôt (`CloturesDuFilArchitectureTest`).
        if ($metadata[self::ACTION_FOR] !== [] && ! CodesDuFil::attend($code)) {
            throw new LogicException("L'événement « {$code} » n'attend aucun geste au catalogue du fil.");
        }

        // `Message::create` : `MessageObserver::created` écrit le pointeur et l'aperçu (= le code).
        $evenement = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => null,
            'type' => MessageType::Event->value,
            'content' => $code,
            'metadata' => $metadata,
        ]);
        // TCK-2982 (ADR-0132 § 5) — un code émetteur d'un lien d'action : les liens partent après le COMMIT, et
        // leur échec ne défait jamais l'événement.
        if (GestesParLien::gesteDuCode($code) !== null) {
            DB::afterCommit(function () use ($evenement): void {
                try {
                    EmettreLesLiensDAction::dispatch((int) $evenement->id);
                } catch (Throwable $e) {
                    report($e);
                }
            });
        }
        // /TCK-2982

        return $evenement;
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
     * TCK-2959 — le `metadata` tel qu'il sort vers un lecteur (fil, liste, export) : sans `action_for`.
     *
     * @param  array<string, mixed>|null  $metadata
     * @return array<string, mixed>|null
     */
    public static function metadataRendu(?array $metadata): ?array
    {
        if ($metadata === null) {
            return null;
        }
        unset($metadata[self::ACTION_FOR]);

        return $metadata;
    }

    /** TCK-2959 — le lecteur figure-t-il parmi les comptes dont l'objet de cet événement attend un geste ? */
    public static function actionAttenduePar(Message $message, ?User $lecteur): bool
    {
        $liste = $message->metadata[self::ACTION_FOR] ?? null;

        return $lecteur !== null && is_array($liste) && in_array((int) $lecteur->getKey(), $liste, true);
    }

    /**
     * TCK-2959 — `$comptes` restreint aux participants actifs (`left_at` nul) du fil : des entiers
     * uniques, triés, en liste (jamais un tableau à clés, que `jsonb` écrirait en objet).
     *
     * @param  iterable<User|int>  $comptes
     * @return list<int>
     */
    private static function participantsActifs(Conversation $conversation, iterable $comptes): array
    {
        $ids = [];
        foreach ($comptes as $compte) {
            $ids[] = $compte instanceof User ? (int) $compte->getKey() : (int) $compte;
        }
        $ids = array_values(array_unique(array_filter($ids, fn (int $id) => $id > 0)));
        if ($ids === []) {
            return [];
        }

        $actifs = $conversation->participants()
            ->wherePivotNull('left_at')
            ->whereIn('users.id', $ids)
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->sort()
            ->values()
            ->all();

        return $actifs;
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
