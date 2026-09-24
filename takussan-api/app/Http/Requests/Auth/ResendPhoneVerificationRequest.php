<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;
use App\Services\Notifications\Sms\PhoneNumber;

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
            ],
        ];
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
