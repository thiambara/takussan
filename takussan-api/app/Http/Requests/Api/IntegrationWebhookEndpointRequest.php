<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-293 (ADR-0046 §7) — lire ou régénérer l'URL de webhook d'une intégration de paiement.
 *
 * Mêmes personnes que pour modifier l'intégration : la règle est celle d'
 * {@see UpdateIntegrationRequest::mayManage()}, lue et non recopiée. Aucun corps.
 */
class IntegrationWebhookEndpointRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return UpdateIntegrationRequest::mayManage($this->user(), $this->route('integration'));
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
