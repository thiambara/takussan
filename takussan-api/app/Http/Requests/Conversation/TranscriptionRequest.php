<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Services\Messaging\Copilote\TranscriptionsDuFil;

/**
 * TCK-2976 (ADR-0131 § 7) — demander la transcription d'une note vocale : la garde du copilote ET sa capacité, hors
 * impersonation ({@see TranscriptionsDuFil::sertLeLecteur()}), jugées avant tout. Refus : 404, comme un message que le
 * lecteur ne lit pas — la transcription n'existe pas pour lui.
 */
class TranscriptionRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $conversation = $this->route('conversation');

        abort_unless(
            $conversation instanceof Conversation && app(TranscriptionsDuFil::class)->sertLeLecteur($this->user(), $conversation),
            404,
        );

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
