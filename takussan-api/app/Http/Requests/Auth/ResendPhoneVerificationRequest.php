<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;
use App\Rules\TelephoneJoignable;
use App\Services\Notifications\Sms\PhoneNumber;
use Illuminate\Validation\Validator;

/**
 * TCK-305 — extrait de PhoneVerificationController::resend(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class ResendPhoneVerificationRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * ⚠ TCK-566 — `phone` n'était contraint qu'en longueur (`max:32`), et cet endpoint
     * l'ENREGISTRE sur l'utilisateur avant d'émettre le code. L'assistant « Publier votre
     * premier bien » a ainsi fait enregistrer, puis « vérifier », la chaîne `780143710+221` :
     * l'indicatif amorcé comme valeur du champ s'était retrouvé derrière les chiffres.
     *
     * La forme exigée est celle que le canal SMS exige lui-même avant tout envoi
     * (`PhoneNumber::E164_REGEX`, relu par `SmsChannel`) : accepter ici un numéro que le SMS
     * refusera en aval, c'est émettre un code qui ne peut arriver nulle part. Et un numéro
     * sénégalais compte exactement 9 chiffres après `+221`.
     *
     * `App\Rules\PhoneRule` n'est PAS employée, délibérément : elle accepte la forme nationale
     * (`771234567`), qu'on enregistrerait telle quelle, et refuse tout numéro étranger.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'phone' => [
                'sometimes',
                'nullable',
                'string',
                'max:32',
                'regex:'.PhoneNumber::E164_REGEX,
                'not_regex:/^\+221(?!\d{9}$)/',
                // TCK-574 — `+330612345678` a la forme E.164, et aucun réseau ne l'achemine.
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (is_string($value) && PhoneNumber::hasNationalTrunkPrefix($value)) {
                        $fail(__('validation.rules.phone_trunk_prefix'));
                    }
                },
            ],
        ];
    }

    /**
     * TCK-574 repair-1 — sans `phone`, le code part au numéro ENREGISTRÉ
     * (`PhoneVerificationSection` et `ProfileContactSection` appellent `send-otp` sans argument),
     * et ce numéro-là n'était jamais relu. Or le profil (`UpdateProfileRequest`,
     * `UpdateMeRequest`) enregistre `+330612345678`, et la forme corrompue `780143710+221` de
     * TCK-566 est restée en base : on émettait alors un code vers un numéro qu'aucun réseau
     * n'achemine. Le numéro enregistré est désormais jugé par les MÊMES règles que celui qu'on
     * envoie ; il n'est ni réécrit ni effacé — la personne le corrige sur son profil.
     *
     * @return array<int, \Closure(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $user = $this->user();
                if ($this->filled('phone') || $user === null || $user->phone_verified_at !== null) {
                    return;
                }
                $enregistre = $user->phone;
                if (! is_string($enregistre) || $enregistre === '') {
                    return; // « No phone number on file » : le contrôleur le dit.
                }
                $cle = self::defautDeJoignabilite($enregistre);
                if ($cle !== null) {
                    $validator->errors()->add('phone', __($cle));
                }
            },
        ];
    }

    /**
     * La clé du message qui dit pourquoi aucun SMS ne peut joindre ce numéro, ou `null` s'il est
     * joignable. Mêmes règles, dans le même ordre, que {@see self::rules()} pour `phone`.
     */
    public static function defautDeJoignabilite(string $numero): ?string
    {
        return TelephoneJoignable::defaut($numero);
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'phone.regex' => __('validation.rules.phone_e164'),
            'phone.not_regex' => __('validation.rules.phone_e164'),
        ];
    }
}
