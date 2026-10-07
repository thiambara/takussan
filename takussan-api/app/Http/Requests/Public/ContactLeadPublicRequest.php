<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use App\Rules\TelephoneJoignable;
use App\Support\TelephoneSaisi;

/**
 * TCK-304/305 — extrait de PublicPropertyController::contactLead(), ou les regles etaient inline.
 *
 * TCK-441 — partagee avec PublicAgentController::contactLead() : le meme formulaire, les memes
 * regles, un seul endroit. Deux copies de ces six lignes divergeraient sans que rien ne le dise.
 *
 * TCK-590 — un visiteur se joint par téléphone OU par e-mail : l'e-mail était exigé et le
 * téléphone libre (`string max:32`), alors qu'au Sénégal on rappelle d'abord. Le téléphone a la
 * forme E.164 et doit être joignable par SMS (`TelephoneJoignable`, la règle du profil) ; la
 * saisie est d'abord ramenée à E.164 (`TelephoneSaisi` : séparateurs, format national sénégalais).
 */
class ContactLeadPublicRequest extends BaseFormRequest
{
    /**
     * TCK-590 — `source` / `medium` : d'où vient le visiteur (`utm_source` / `utm_medium` du lien
     * partagé). Un jeton court, jamais une phrase : ce qui est enregistré se relit dans la console.
     */
    public const ATTRIBUTION = ['nullable', 'string', 'max:40', 'regex:/^[a-z0-9_.-]+$/'];

    /**
     * L'autorisation reste dans le controleur / la policy (principes 1 et 2, TCK-306).
     * `BaseFormRequest` refuse par defaut : sans cette surcharge, l'endpoint rendrait 403.
     */
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        if ($this->has('phone')) {
            $this->merge(['phone' => TelephoneSaisi::normaliser($this->input('phone'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['nullable', 'required_without:phone', 'email:rfc', 'max:180'],
            'phone' => ['nullable', 'required_without:email', 'string', 'max:32', new TelephoneJoignable],
            'message' => ['required', 'string', 'min:5', 'max:2000'],
            'source' => self::ATTRIBUTION,
            'medium' => self::ATTRIBUTION,
            'company' => ['nullable', 'string', 'max:120'], // honeypot
        ];
    }
}
