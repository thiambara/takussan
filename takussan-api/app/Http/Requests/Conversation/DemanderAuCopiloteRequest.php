<?php

namespace App\Http\Requests\Conversation;

use App\Services\Messaging\Copilote\SortesDuCopilote;

/**
 * TCK-2974 (ADR-0131 § 3) — `POST …/copilote/{sorte}`. Pour `resume`, `depuis_message_id` : le premier message
 * non lu que le front a affiché au séparateur. La fenêtre ne se lit pas sur `last_read_at` : le front marque le
 * fil lu à l'ouverture, avant ou pendant la demande.
 */
class DemanderAuCopiloteRequest extends CopiloteRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return match ($this->route('sorte')) {
            SortesDuCopilote::RESUME => ['depuis_message_id' => ['required', 'integer', 'min:1']],
            // TCK-2975 — la question est une saisie du lecteur ; le ton, « Plus court » de la maquette.
            SortesDuCopilote::QUESTION => ['question' => ['required', 'string', 'max:500']],
            SortesDuCopilote::BROUILLON => ['ton' => ['sometimes', 'string', 'in:court,normal']],
            default => [],
        };
    }
}
