<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;
use App\Support\CaseInsensitive;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('email') && is_string($this->input('email'))) {
            $this->merge(['email' => CaseInsensitive::fold(trim((string) $this->input('email')))]);
        }
    }

    public function rules(): array
    {
        // TCK-2605 — l'adresse et le mot de passe suffisent : le prénom est demandé à l'écran
        // suivant (`EtapePrenom`), comme pour un compte né par téléphone ou par Google. La
        // confirmation devient facultative, mais une confirmation ENVOYÉE est toujours vérifiée —
        // y compris vide (`""` → null par `ConvertEmptyStringsToNull`), qui refuse comme avant.
        return [
            'first_name' => ['sometimes', 'nullable', 'string', 'max:100'],
            'last_name' => ['sometimes', 'nullable', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            // TCK-537 (AC1) — la case « J'accepte les conditions générales et la politique de
            // confidentialité » que l'écran rend obligatoire : l'API l'exige aussi, et l'inscription
            // en écrit la preuve (`ConsentLedger`, contexte `register`).
            'terms_accepted' => ['required', 'accepted'],
            'password' => array_values(array_filter([
                'required',
                'string',
                $this->exists('password_confirmation') ? 'confirmed' : null,
                Password::defaults(),
            ])),
        ];
    }
}
