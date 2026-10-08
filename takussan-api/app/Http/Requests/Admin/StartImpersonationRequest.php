<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-600 (ADR-0055) — ouvrir une session d'impersonation : `super_admin` seul, motif obligatoire.
 * Le motif est conservé dans la session et dans l'activité de début.
 */
class StartImpersonationRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::UsersImpersonate) === true;
    }

    /**
     * verif-600 B1-bis — le motif se lit dans le CORPS seul. `all()` fusionne la query : une URL
     * réécrite (`…/impersonate?reason=…&x=/notes`, sous le corps d'une autre requête) ouvrait une
     * session avec un motif que personne n'avait saisi dans le formulaire.
     *
     * @return array<string, mixed>
     */
    public function validationData(): array
    {
        return $this->getInputSource()->all();
    }

    /**
     * Le parent normalise `input()` — query COMPRISE — et le réécrit dans le corps : le `reason`
     * d'une URL réécrite y entrait avant que {@see validationData()} ne le lise. Ici, le corps seul.
     */
    protected function prepareForValidation(): void
    {
        $corps = $this->getInputSource();
        $corps->replace($this->normalize($corps->all()));
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ];
    }
}
