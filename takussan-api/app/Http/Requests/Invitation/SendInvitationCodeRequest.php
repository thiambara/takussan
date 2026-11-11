<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Invitation;
use App\Rules\TelephoneJoignable;
use App\Services\Invitation\InvitationService;
use Illuminate\Validation\Rule;

/**
 * TCK-2610 (ADR-0094 § 5) — `POST /api/public/invitations/{token}/code`. Public : le jeton est le secret porteur.
 *
 *  - Drapeau `auth.phone_login.enabled` éteint : 404, avant toute validation (comme `auth/phone/*`).
 *  - L'état du jeton se juge ensuite, AVANT la validation : 404 `invitation.token_not_found`, 410 `token_*` priment un
 *    corps incomplet ({@see InvitationService::lookupActiveInvitation()}, sans seconde lecture de ses règles).
 *  - Invitation par SMS : le code part au numéro de l'invitation, et un `phone` du corps est ignoré. Par e-mail : le
 *    numéro est saisi, `phone` est requis.
 */
class SendInvitationCodeRequest extends BaseFormRequest
{
    private ?Invitation $invitation = null;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        abort_unless((bool) config('auth.phone_login.enabled'), 404);
        $this->invitation = app(InvitationService::class)->lookupActiveInvitation((string) $this->route('token'));

        parent::prepareForValidation();
        if (is_string($this->input('phone'))) {
            $this->merge(['phone' => preg_replace('/\s+/', '', $this->input('phone'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'phone' => [Rule::requiredIf(fn (): bool => $this->invitation()->email !== null), 'nullable', 'string', 'max:30', new TelephoneJoignable],
        ];
    }

    /** L'invitation actionnable que le jeton désigne, lue avant la validation. */
    public function invitation(): Invitation
    {
        return $this->invitation ??= app(InvitationService::class)->lookupActiveInvitation((string) $this->route('token'));
    }

    /** Le numéro auquel le code part : celui de l'invitation par SMS, celui saisi pour une invitation par e-mail. */
    public function phone(): string
    {
        $invitation = $this->invitation();

        return $invitation->email === null ? (string) $invitation->phone : (string) $this->validated('phone');
    }
}
