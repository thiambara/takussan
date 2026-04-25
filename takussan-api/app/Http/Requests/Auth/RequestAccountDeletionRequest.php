<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;
use App\Services\Account\AccountDeletionService;
use App\Services\Auth\TwoFactorService;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * TCK-080 — payload + step-up auth for `POST /auth/me/deletion-request`.
 *
 * - Re-verifies the password server-side (defense in depth: even an
 *   already-authenticated user must re-prove possession).
 * - When the user has 2FA enabled, requires either a `two_factor_code`
 *   (TOTP) or a `recovery_code` and validates it via {@see TwoFactorService}.
 *   Mirrors the `disable 2FA` UX so users have one consistent step-up flow.
 * - Surfaces obligations as a 422 before reaching the service — the service
 *   re-checks defensively.
 */
class RequestAccountDeletionRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'password' => ['required', 'string'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'reason_code' => [
                'sometimes', 'nullable', 'string',
                Rule::in(AccountDeletionService::REASON_CODES),
            ],
            'two_factor_code' => ['sometimes', 'nullable', 'string', 'size:6'],
            'recovery_code' => ['sometimes', 'nullable', 'string'],
        ];
    }

    /**
     * Stack our auth checks on top of base validation. Runs once base
     * rules pass — failures translate to 422 (`password`, `two_factor_code`)
     * or 422 (`obligations`) consistent with the rest of the auth surface.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $user = $this->user();
            if ($user === null) {
                return;
            }

            if (! Hash::check((string) $this->input('password'), $user->password)) {
                $validator->errors()->add('password', __('account.deletion.errors.password_invalid'));

                return;
            }

            if ($user->two_factor_enabled) {
                /** @var TwoFactorService $tfa */
                $tfa = app(TwoFactorService::class);
                $code = $this->input('two_factor_code');
                $recovery = $this->input('recovery_code');

                $authorized = false;
                if ($code) {
                    $authorized = $tfa->verifyCodeForUser($user, (string) $user->two_factor_secret, (string) $code);
                }
                if (! $authorized && $recovery) {
                    $authorized = $tfa->verifyRecoveryCode($user, (string) $recovery);
                }

                if (! $authorized) {
                    $validator->errors()->add('two_factor_code', __('account.deletion.errors.two_factor_required'));

                    return;
                }
            }

            // Anti-escalade — pre-check before the service so the FormRequest
            // surfaces an `obligations` payload alongside the 422.
            $obligations = app(AccountDeletionService::class)->collectOpenObligations($user);
            if ($obligations !== []) {
                $validator->errors()->add('obligations', __('account.deletion.errors.has_obligations'));
                $this->merge(['_obligations' => $obligations]);
            }
        });
    }

    /**
     * Override the failure response so 422 includes the structured
     * `obligations` array when applicable.
     */
    protected function failedValidation(Validator $validator): void
    {
        $obligations = $this->input('_obligations');
        $errors = $validator->errors()->toArray();

        $payload = [
            'message' => __('account.deletion.errors.invalid_request'),
            'errors' => $errors,
        ];

        if (is_array($obligations) && $obligations !== []) {
            $payload['obligations'] = $obligations;
        }

        throw new ValidationException(
            $validator,
            response()->json($payload, 422),
        );
    }
}
