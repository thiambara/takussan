<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Invitation;
use App\Rules\TelephoneJoignable;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Invitation\InvitationService;
use Illuminate\Validation\Rule;

/**
 * TCK-2610 (ADR-0094 § 5) — `POST /api/public/invitations/{token}/code`. Public : le jeton est le secret porteur.
 *
 *  - Drapeau `auth.phone_login.enabled` éteint : 404, avant toute validation (comme `auth/phone/*`).
 *  - L'état du jeton se juge ensuite, AVANT la validation : 404 `invitation.token_not_found`, 410 `token_*` priment un
 *    corps incomplet ({@see InvitationService::lookupActiveInvitation()}, sans seconde lecture de ses règles).
 *  - Invitation par SMS : le code part au numéro de l'invitation, ou — TCK-2939 (ADR-0094, amendement du 2026-11-15
 *    § 4) — au numéro CORRIGÉ par l'invité, s'il en donne un. Par e-mail : le numéro est saisi, `phone` est requis.
 *  - TCK-2939 — une invitation PARTAGÉE (ADR-0123 § 4) refuse un numéro corrigé (422) : son lien a pu être transmis à
 *    n'importe qui, la preuve du numéro saisi par l'admin est sa seule garde.
 *  - TCK-2940 (ADR-0126) — `channel` : `sms` (défaut) ou `voice`, ce dernier refusé en 422 sans pilote d'appel.
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
            'phone' => [
                Rule::requiredIf(fn (): bool => $this->invitation()->email !== null),
                // TCK-2939 — le numéro d'une invitation partagée ne se corrige pas.
                Rule::prohibitedIf(fn (): bool => $this->invitation()->estPartagee()),
                'nullable', 'string', 'max:30', new TelephoneJoignable,
            ],
            // TCK-2940 (ADR-0126 § 2) — `voice` n'est admis que si un pilote d'appel est disponible : sinon 422 sur `channel`.
            'channel' => ['nullable', 'string', Rule::in(PhoneVerificationService::voiceAvailable() ? ['sms', 'voice'] : ['sms'])],
        ];
    }

    /** TCK-2940 (ADR-0126) — la voie demandée : `sms` par défaut, `voice` pour le code dicté par un appel. */
    public function channel(): string
    {
        return (string) ($this->validated('channel') ?? 'sms');
    }

    /** L'invitation actionnable que le jeton désigne, lue avant la validation. */
    public function invitation(): Invitation
    {
        return $this->invitation ??= app(InvitationService::class)->lookupActiveInvitation((string) $this->route('token'));
    }

    /**
     * Le numéro auquel le code part : celui saisi (requis par e-mail ; TCK-2939, la correction d'une invitation par SMS),
     * sinon celui de l'invitation.
     */
    public function phone(): string
    {
        $saisi = (string) $this->validated('phone');

        return $saisi !== '' ? $saisi : (string) $this->invitation()->phone;
    }
}
