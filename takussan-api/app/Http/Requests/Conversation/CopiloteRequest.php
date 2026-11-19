<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Services\Messaging\Copilote\GardeDuCopilote;
use App\Support\ImpersonationContext;

/**
 * TCK-2974 (ADR-0131 § 1) — toute requête au copilote d'un fil, lecture de l'état comprise : la garde du
 * copilote ET la capacité `messaging.copilot` ({@see GardeDuCopilote::autorise()}), jugées AVANT toute
 * validation, et rejugées à chaque lecture. Refus : 403 `copilote.indisponible`, jamais sa raison. Sous
 * impersonation, refusé quel que soit le verbe (`EnforceImpersonationReadOnly` laisse passer un `GET`).
 */
class CopiloteRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $conversation = $this->route('conversation');
        $user = $this->user();

        abort_code_unless(
            $user !== null
                && $conversation instanceof Conversation
                && ! app(ImpersonationContext::class)->active()
                && app(GardeDuCopilote::class)->autorise($user, $conversation),
            403,
            'copilote.indisponible',
        );

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
