<?php

namespace App\Http\Requests\Api;

use App\Domain\Integrations\Providers\IntegrationProviderRegistry;
use App\Http\Requests\BaseFormRequest;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de IntegrationController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreIntegrationRequest extends BaseFormRequest
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

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-602 (ADR-0051 §3) — un fournisseur que le registre ne connaît pas n'a ni pilote
            // ni schéma : l'accepter, c'était créer une intégration que rien ne lit.
            'provider' => ['required', 'string', 'max:255', Rule::in(app(IntegrationProviderRegistry::class)->keys())],
            'agency_id' => ['nullable', 'exists:agencies,id'],
            'credentials' => ['required', 'array'],
            'is_active' => ['nullable', 'boolean'],
            'metadata' => ['nullable', 'array'],
        ];
    }

    /**
     * TCK-602 (ADR-0051 §3) — un fournisseur de PAIEMENT ne s'enregistre qu'avec les identifiants
     * que son schéma exige (la liste même que lit son pilote) : une intégration incomplète était
     * acceptée en 201, puis cassait au premier paiement.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->hasAny(['provider', 'credentials'])) {
                return;
            }
            foreach (self::credentialErrors((string) $this->input('provider'), (array) $this->input('credentials', [])) as $field => $message) {
                $validator->errors()->add($field, $message);
            }
        });
    }

    /**
     * Les erreurs `credentials.<clé>` du schéma d'un fournisseur de paiement ; aucune pour un
     * fournisseur d'une autre catégorie.
     *
     * @param  array<string, mixed>  $credentials
     * @return array<string, string>
     */
    public static function credentialErrors(string $provider, array $credentials): array
    {
        $definition = app(IntegrationProviderRegistry::class)->get($provider);
        if ($definition->category() !== 'payments') {
            return [];
        }

        $errors = [];
        foreach (array_keys($definition->validate($credentials)) as $key) {
            $errors["credentials.{$key}"] = __('validation.required', ['attribute' => $key]);
        }

        return $errors;
    }
}
