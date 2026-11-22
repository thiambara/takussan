<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2874 (ADR-0110 § 8) — `POST /api/customers/{customer}/pipeline-stage/undo` : défaire le passage
 * en Négociation fait par l'acceptation d'une candidature ou d'une offre, dans les 24 h. Aucun corps :
 * le changement défait est le DERNIER de la fiche (409 s'il n'est plus celui de l'acceptation).
 * Délégation à `CustomerPolicy::undoPipelineStage`, avant la validation.
 */
class UndoPipelineStageRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('undoPipelineStage', $this->route('customer')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
