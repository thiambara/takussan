<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Support\Http\ParametreUnique;

/**
 * TCK-2838 — `GET /api/me/owner-profiles/{owner_profile}/interlocuteur` : la personne qui, à l'agence, s'occupe du
 * bailleur invité. La porte est la policy (`viewInterlocutor`, le titulaire seul), invoquée avant la validation.
 *
 * `fields[interlocuteur]` : les champs voulus parmi {@see self::CHAMPS} ; tous sans le paramètre, un nom inconnu
 * ignoré, `source` toujours rendu. Une valeur reçue en liste vaut absente (ADR-0075).
 */
class ShowInterlocuteurOwnerProfileRequest extends BaseFormRequest
{
    /** Ce que la projection peut rendre — jamais l'identifiant, l'e-mail ni le second numéro de l'invitant. */
    public const CHAMPS = ['first_name', 'last_name', 'role', 'phone', 'whatsapp'];

    public function authorize(): bool
    {
        return $this->user()?->can('viewInterlocutor', $this->route('owner_profile')) === true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['fields' => ['interlocuteur' => ParametreUnique::chaine($this, 'fields.interlocuteur')]]);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'fields.interlocuteur' => ['nullable', 'string', 'max:200'],
        ];
    }

    /** @return list<string> les champs demandés, connus seulement */
    public function champs(): array
    {
        $demandes = $this->validated('fields.interlocuteur');
        if ($demandes === null) {
            return self::CHAMPS;
        }

        return array_values(array_intersect(self::CHAMPS, array_map('trim', explode(',', (string) $demandes))));
    }
}
