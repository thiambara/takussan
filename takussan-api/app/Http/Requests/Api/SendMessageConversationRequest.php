<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\AuthorizesTransitionally;
use App\Models\Enums\MessageType;
use App\Rules\FichierNonVide;
use App\Rules\PixelsAuPlus;
use App\Services\Messaging\ConversationAccess;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de ConversationController::sendMessage(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class SendMessageConversationRequest extends BaseFormRequest
{
    use AuthorizesTransitionally;

    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ **REPRISE, pas délégation** : cette règle n'est pas encore dans une policy — elle fait
     * partie des 19 helpers relevés hors périmètre de TCK-306. L'expression est reproduite à
     * l'identique ; son domicile définitif est une policy, et le ticket de suite doit la
     * convertir en délégation comme les 35 autres.
     */
    public function authorize(): bool
    {
        $conversation = $this->route('conversation');

        // P248.01 (TCK-2374) — écrire n'est pas lire : le demandeur au bail fini garde le fil d'une
        // intervention en lecture seule (`ConversationAccess::allowsWriting`).
        return $this->isActiveParticipant($conversation)
            && app(ConversationAccess::class)->allowsWriting($this->user(), $conversation);
    }

    /**
     * TCK-592 — les types qu'un PARTICIPANT écrit.
     *
     * `type` acceptait tout `MessageType`, que le contrôleur écrivait tel quel : un participant
     * postait un `system`, rendu comme un avis de la plateforme, non compté non lu, et que personne
     * ne pouvait supprimer ni corriger (`ConversationPolicy`, `MessageObserver`). `image` et
     * `document` passaient de même, sans fichier. Le seul auteur légitime d'un avis système est
     * `SystemMessageFactory`, qui n'emprunte pas cette route.
     *
     * TCK-2631 (ADR-0038, amendement du 2026-11-10) — `image` et `document` y entrent, AVEC leur
     * fichier (`file`) : une photo ou un PDF par message.
     */
    public const PARTICIPANT_TYPES = [MessageType::Text, MessageType::Audio, MessageType::Image, MessageType::Document];

    /**
     * TCK-2631 (ADR-0038, amendement du 2026-11-10) — les types qui portent une pièce jointe, avec
     * ce que `finfo` doit lire dans le CONTENU (`mimetypes:`, jamais l'extension) et la borne en Ko.
     *
     * @var array<string, array{mimetypes: list<string>, max_kb: int}>
     */
    public const ATTACHMENT_RULES = [
        'image' => ['mimetypes' => ['image/jpeg', 'image/png', 'image/webp'], 'max_kb' => 8192],
        'document' => ['mimetypes' => ['application/pdf'], 'max_kb' => 10240],
    ];

    /**
     * ADR-0038 — formats que produisent les navigateurs mobiles (`MediaRecorder`) et les lecteurs
     * courants. `video/webm` : ce que `finfo` rend pour un enregistrement Chrome sans piste vidéo.
     * `video/mp4` (TCK-2058, amendement du 2026-10-23) : ce que `finfo` rend pour un MP4 audio de
     * marque générique (`isom`, `iso5`, `iso6`, `mp42`) — il juge la marque `ftyp`, pas la piste ;
     * seule la marque `M4A ` est lue `audio/x-m4a`. La borne de 2 Mo reste ce qui protège.
     */
    public const AUDIO_MIMETYPES = [
        'audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg',
    ];

    /** ADR-0038 — la borne APPLIQUÉE (Ko). La durée, elle, est déclarée par le client. */
    public const AUDIO_MAX_KB = 2048;

    public const AUDIO_MAX_SECONDS = 60;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // TCK-2631 — la légende d'une photo ou d'un PDF est facultative, comme le texte d'une note vocale.
        // Un `type` qui n'est pas une chaîne (tableau) est refusé par sa propre règle, jamais en 500 ici.
        $type = is_string($this->input('type')) ? $this->input('type') : null;
        $attachment = $type === null ? null : (self::ATTACHMENT_RULES[$type] ?? null);
        $attachmentTypes = implode(',', array_keys(self::ATTACHMENT_RULES));

        return [
            'content' => ['required_unless:type,audio,'.$attachmentTypes, 'nullable', 'string', 'max:5000'],
            'type' => ['nullable', Rule::in(array_map(static fn (MessageType $t): string => $t->value, self::PARTICIPANT_TYPES))],
            'audio' => [
                'required_if:type,audio', 'prohibited_unless:type,audio',
                'file', 'mimetypes:'.implode(',', self::AUDIO_MIMETYPES), 'max:'.self::AUDIO_MAX_KB,
            ],
            'duration' => [
                'required_if:type,audio', 'prohibited_unless:type,audio',
                'integer', 'min:1', 'max:'.self::AUDIO_MAX_SECONDS,
            ],
            // TCK-2631 — un fichier, requis pour `image` et `document`, interdit ailleurs. Ses
            // pixels sont bornés sur l'EN-TÊTE (`PixelsAuPlus`) : le réencodage qui retire l'EXIF
            // décode l'image entière, dans la requête.
            'file' => [
                'required_if:type,'.$attachmentTypes, 'prohibited_unless:type,'.$attachmentTypes,
                'file', new FichierNonVide,
                ...($attachment === null ? [] : [
                    'mimetypes:'.implode(',', $attachment['mimetypes']),
                    'max:'.$attachment['max_kb'],
                ]),
                ...($type === MessageType::Image->value ? [new PixelsAuPlus] : []),
            ],
        ];
    }

    /** TCK-2631 — le nom du champ dans un 422 (`messaging.attributes`). */
    public function attributes(): array
    {
        return ['file' => __('messaging.attributes.file')];
    }
}
