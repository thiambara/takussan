<?php

namespace App\Http\Requests\Auth;

use App\Models\User;
use App\Rules\TelephoneJoignable;
use App\Services\Auth\PhoneChangeGuard;
use App\Support\CaseInsensitive;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => CaseInsensitive::fold(trim((string) $this->input('email')))]);
        }
    }

    public function rules(): array
    {
        return [
            // TCK-623 — les noms ne sont exigés que s'ils sont ENVOYÉS : un compte ouvert par
            // téléphone ou par OAuth naît sans nom, et la section contact du profil (bio, numéro)
            // ne doit pas être bloquée par un champ qu'elle ne montre pas. Le prénom envoyé ne
            // peut pas être vide ; le nom, si.
            'first_name' => ['sometimes', 'required', 'string', 'max:100'],
            'last_name' => ['sometimes', 'nullable', 'string', 'max:100'],
            'bio' => ['nullable', 'string', 'max:1000'],
            // TCK-632 — un compte ouvert par téléphone naît sans e-mail, et c'est ici qu'il en
            // ajoute un. Envoyé, il ne peut pas être vide : retirer l'adresse n'est pas un geste
            // de cette section. L'unicité se juge sur l'expression de `users_email_lower_unique`
            // (ADR-0025) : sans elle, une variante de casse passerait la règle et mourrait en 500
            // sur l'index.
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', function (string $attribut, mixed $valeur, Closure $echec): void {
                $prise = User::query()
                    ->whereKeyNot($this->user()?->getKey())
                    ->whereRaw(CaseInsensitive::sql('email').' = ?', [CaseInsensitive::fold((string) $valeur)])
                    ->exists();
                if ($prise) {
                    $echec('validation.unique')->translate();
                }
            }],
            'avatar' => ['nullable', 'image', 'max:2048'],
            'avatar_remove' => ['sometimes', 'boolean'],
            // E.164 strict — leading "+", country code [1-9], 6-14 more digits.
            // Empty string is allowed and treated as "clear" in the controller.
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^(?:\+[1-9]\d{6,14})?$/', new TelephoneJoignable],
            // TCK-589 p3-1 — la preuve qu'exige le remplacement d'un numéro vérifié.
            ...PhoneChangeGuard::PROOF_RULES,
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => __('validation.rules.phone_e164'),
        ];
    }
}
