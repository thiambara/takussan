<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;
use App\Services\Account\AccountDeletionService;
use App\Services\Account\DeletionStepUpService;
use App\Services\Auth\TwoFactorService;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * TCK-080 / TCK-272 — payload + step-up auth for `POST /auth/me/deletion-request`.
 *
 * - Re-verifies possession server-side (defense in depth: even an
 *   already-authenticated user must re-prove it).
 * - **Two mutually exclusive step-up modes, and the SERVER picks.** A user
 *   with a usable password re-types it (historical TCK-080 path). A user
 *   whose stored hash is a machine value — OAuth signup, invitation
 *   accepted without a password, platform-provisioned admin — gets a
 *   6-digit code by e-mail instead (TCK-272). Before TCK-272 the second
 *   population was told « Mot de passe incorrect. » forever: a right
 *   denied behind a message blaming them for a typo.
 * - When the user has 2FA enabled, requires either a `two_factor_code`
 *   (TOTP) or a `recovery_code`, **on both paths**.
 * - Surfaces obligations as a 422 before reaching the service — the service
 *   re-checks defensively.
 *
 * ⚠️ SÉCURITÉ — la branche est calculée à partir de
 * `$this->user()->hasUsablePassword()` et de RIEN d'autre. La faire
 * dépendre d'une valeur du payload (`required_if:mode,…`) rendrait la
 * suppression exécutable sans aucune preuve : il suffirait au client
 * d'annoncer le mode le plus faible.
 */
class RequestAccountDeletionRequest extends BaseFormRequest
{
    public const STEP_UP_PASSWORD = 'password';

    public const STEP_UP_EMAIL_CODE = 'email_code';

    /** Renseigné par {@see withValidator()} une fois la preuve acceptée. */
    private ?string $stepUpMode = null;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Le mode de step-up effectivement utilisé — journalisé par
     * {@see AccountDeletionService::requestDeletion()} (AC7).
     */
    public function stepUpMode(): string
    {
        return $this->stepUpMode ?? self::STEP_UP_PASSWORD;
    }

    /** Le compte a-t-il un mot de passe que son propriétaire connaît ? */
    private function usesPasswordStepUp(): bool
    {
        return $this->user()?->hasUsablePassword() ?? true;
    }

    public function rules(): array
    {
        $withPassword = $this->usesPasswordStepUp();

        return [
            // `prohibited` sur la voie inverse : on n'ouvre pas deux portes
            // à la fois, et un `password` envoyé sur un compte sans mot de
            // passe utilisable doit produire un message qui ORIENTE, pas
            // « Mot de passe incorrect. ».
            'password' => $withPassword ? ['required', 'string'] : ['prohibited'],
            'step_up_code' => $withPassword
                ? ['prohibited']
                : ['required', 'string', 'size:6'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'reason_code' => [
                'sometimes', 'nullable', 'string',
                Rule::in(AccountDeletionService::REASON_CODES),
            ],
            'two_factor_code' => ['sometimes', 'nullable', 'string', 'size:6'],
            'recovery_code' => ['sometimes', 'nullable', 'string'],
        ];
    }

    /** @return array<string,string> */
    public function messages(): array
    {
        return [
            'password.prohibited' => __('account.deletion.errors.password_not_applicable'),
            'step_up_code.prohibited' => __('account.deletion.errors.step_up_not_applicable'),
            'step_up_code.required' => __('account.deletion.errors.step_up_code_required'),
            'step_up_code.size' => __('account.deletion.errors.step_up_code_invalid'),
        ];
    }

    /**
     * Stack our auth checks on top of base validation — failures translate to
     * 422 (`password`, `step_up_code`, `two_factor_code`) or 422
     * (`obligations`) consistent with the rest of the auth surface.
     *
     * ⚠️ Un `after()` NE s'exécute PAS « une fois les règles de base passées » :
     * `Validator::passes()` déroule les règles PUIS appelle inconditionnellement
     * tous les `after`, que le premier passage ait échoué ou non. Ce docblock
     * affirmait le contraire, et la garde ci-dessous est ce qui le rend vrai.
     *
     * Sans elle, un `reason` de 2500 caractères (règle `max:2000`) faisait
     * échouer la requête en 422 APRÈS que ce bloc ait vérifié — et surtout
     * CONSOMMÉ — le code e-mail à usage unique : l'utilisateur perdait son code
     * sans que rien ne soit supprimé, exactement ce que la scission
     * `verifyCode()` / `consumeCode()` existe pour empêcher.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            // Une preuve de possession ne se vérifie — et ne se consomme —
            // que sur une requête par ailleurs valide.
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $user = $this->user();
            if ($user === null) {
                return;
            }

            $stepUp = app(DeletionStepUpService::class);
            $usesPassword = $this->usesPasswordStepUp();

            if ($usesPassword) {
                if (! Hash::check((string) $this->input('password'), $user->password)) {
                    $validator->errors()->add('password', __('account.deletion.errors.password_invalid'));

                    return;
                }
                $this->stepUpMode = self::STEP_UP_PASSWORD;
            } else {
                if (! $stepUp->verifyCode($user, (string) $this->input('step_up_code'))) {
                    $validator->errors()->add('step_up_code', __('account.deletion.errors.step_up_code_invalid'));

                    return;
                }
                $this->stepUpMode = self::STEP_UP_EMAIL_CODE;
            }

            // Le 2FA reste obligatoire sur LES DEUX voies. Il est exécuté
            // après la preuve de possession dans les deux branches — ne pas
            // laisser un chemin où la branche alternative réussit sans lui.
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

                return;
            }

            // TCK-272 — le code e-mail n'est consommé QU'ICI, une fois tous
            // les contrôles passés. Le brûler plus tôt ferait perdre son
            // code à quelqu'un dont le TOTP a glissé d'un pas ou dont un
            // bail est encore ouvert, et le pousserait à en réémettre en
            // boucle. La consommation reste dans la même requête que la
            // suppression : pas de fenêtre de rejeu exploitable.
            if ($this->stepUpMode === self::STEP_UP_EMAIL_CODE) {
                $stepUp->consumeCode($user);
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
