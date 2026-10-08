<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\AuthorizesTransitionally;
use App\Models\Enums\MessageType;
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
        return $this->isActiveParticipant($this->route('conversation'));
    }

    /**
     * TCK-592 — les types qu'un PARTICIPANT écrit.
     *
     * `type` acceptait tout `MessageType`, que le contrôleur écrivait tel quel : un participant
     * postait un `system`, rendu comme un avis de la plateforme, non compté non lu, et que personne
     * ne pouvait supprimer ni corriger (`ConversationPolicy`, `MessageObserver`). `image` et
     * `document` passaient de même, sans fichier. Le seul auteur légitime d'un avis système est
     * `SystemMessageFactory`, qui n'emprunte pas cette route.
     */
    public const PARTICIPANT_TYPES = [MessageType::Text, MessageType::Audio];

    /**
     * ADR-0038 — formats que produisent les navigateurs mobiles (`MediaRecorder`) et les lecteurs
     * courants. `video/webm` : ce que `finfo` rend pour un enregistrement Chrome sans piste vidéo.
     */
    public const AUDIO_MIMETYPES = [
        'audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg',
    ];

    /** ADR-0038 — la borne APPLIQUÉE (Ko). La durée, elle, est déclarée par le client. */
    public const AUDIO_MAX_KB = 2048;

    public const AUDIO_MAX_SECONDS = 60;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'content' => ['required_unless:type,audio', 'nullable', 'string'],
            'type' => ['nullable', Rule::in(array_map(static fn (MessageType $t): string => $t->value, self::PARTICIPANT_TYPES))],
            'audio' => [
                'required_if:type,audio', 'prohibited_unless:type,audio',
                'file', 'mimetypes:'.implode(',', self::AUDIO_MIMETYPES), 'max:'.self::AUDIO_MAX_KB,
            ],
            'duration' => [
                'required_if:type,audio', 'prohibited_unless:type,audio',
                'integer', 'min:1', 'max:'.self::AUDIO_MAX_SECONDS,
            ],
        ];
    }
}
