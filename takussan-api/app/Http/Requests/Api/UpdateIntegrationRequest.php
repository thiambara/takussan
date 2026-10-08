<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Integration;
use App\Models\User;
use Illuminate\Contracts\Validation\Validator;

/**
 * TCK-305 — extrait de IntegrationController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateIntegrationRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ **REPRISE, pas délégation** : cette règle n'est pas encore dans une policy — elle fait
     * partie des 19 helpers relevés hors périmètre de TCK-306. L'expression est reproduite à
     * l'identique ; son domicile définitif est une policy, et le ticket de suite doit la
     * convertir en délégation comme les 35 autres.
     */
    public function authorize(): bool
    {
        return self::mayManage($this->user(), $this->route('integration'));
    }

    /**
     * La règle, lue aussi par {@see IntegrationWebhookEndpointRequest} (TCK-293) : l'URL de webhook
     * se lit et se régénère par qui peut modifier l'intégration, et par personne d'autre.
     */
    public static function mayManage(?User $user, Integration $integration): bool
    {
        return $user !== null && ($user->isSuperAdmin()
            || ($user->agency_id !== null && $user->agency_id === $integration->agency_id && $user->isAgencyAdminAt((int) $integration->agency_id)));
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'credentials' => ['sometimes', 'required', 'array'],
            'is_active' => ['sometimes', 'boolean'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];
    }

    /**
     * TCK-602 (ADR-0051 §3) — en édition, les identifiants envoyés se FUSIONNENT aux secrets
     * enregistrés (comme `IntegrationService::update`) : c'est le résultat de la fusion qui doit
     * satisfaire le schéma d'un fournisseur de paiement.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->has('credentials') || $validator->errors()->has('credentials')) {
                return;
            }
            /** @var Integration $integration */
            $integration = $this->route('integration');
            foreach (StoreIntegrationRequest::credentialErrors((string) $integration->provider, $this->mergedCredentials()) as $field => $message) {
                $validator->errors()->add($field, $message);
            }
        });
    }

    /**
     * Les identifiants enregistrés, recouverts par ceux de la requête.
     *
     * @return array<string, mixed>
     */
    public function mergedCredentials(): array
    {
        /** @var Integration $integration */
        $integration = $this->route('integration');
        $stored = is_array($integration->credentials) ? $integration->credentials : [];

        return array_replace($stored, (array) $this->input('credentials', []));
    }
}
