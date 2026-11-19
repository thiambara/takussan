<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Services\Messaging\EquipeDuFil;
use App\Support\ImpersonationContext;

/**
 * TCK-2981 (ADR-0132 § 3) — `POST /api/conversations/{conversation}/pont/invitations` : l'auteur est personnel actif
 * de l'agence du fil ET participant actif ; jamais sous impersonation. Sinon 403, sans rien dire du fil.
 */
class StorePontInvitationRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $fil = $this->route('conversation');
        $user = $this->user();

        abort_code_unless(
            $user !== null
                && $fil instanceof Conversation
                && ! app(ImpersonationContext::class)->active()
                && $fil->participants()->where('users.id', $user->id)->wherePivotNull('left_at')->exists()
                && EquipeDuFil::tiersLitLesNotes($user, $fil),
            403,
            'pont.not_allowed',
        );

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // La fiche sans compte (`customer_id`) : hors de ce lot (TCK-2981, partiel).
        return ['user_id' => ['required', 'integer', 'min:1']];
    }
}
