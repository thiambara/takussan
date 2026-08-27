<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-304/305 — extrait de PublicPropertyController::contactLead(), ou les regles etaient inline.
 *
 * TCK-441 — partagee avec PublicAgentController::contactLead() : le meme formulaire, les memes
 * regles, un seul endroit. Deux copies de ces six lignes divergeraient sans que rien ne le dise.
 */
class ContactLeadPublicRequest extends BaseFormRequest
{
    /**
     * L'autorisation reste dans le controleur / la policy (principes 1 et 2, TCK-306).
     * `BaseFormRequest` refuse par defaut : sans cette surcharge, l'endpoint rendrait 403.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:180'],
            'phone' => ['nullable', 'string', 'max:32'],
            'message' => ['required', 'string', 'min:5', 'max:2000'],
            'company' => ['nullable', 'string', 'max:120'], // honeypot
        ];
    }
}
