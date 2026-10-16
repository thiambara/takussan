<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\SettingScope;

/**
 * TCK-305 — extrait de SettingController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateSettingRequest extends BaseFormRequest
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
        $user = $this->user();
        $setting = $this->route('setting');

        if ($user === null) {
            return false;
        }

        if ($setting->scope === SettingScope::Global) {
            return $user->isSuperAdmin();
        }

        return $user->isSuperAdmin()
            || ($user->agency_id !== null && $user->agency_id === $setting->scope_id && $user->isAgencyAdminAt((int) $setting->scope_id));
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'value' => ['required', 'array'],
        ];
    }

    /**
     * TCK-651 (ADR-0065) — la route brute n'écrit plus la portée `global` : ce que le code y lit
     * s'écrit par un catalogue. `authorize()` a déjà rendu 403 à qui n'est pas super-admin.
     */
    protected function passedValidation(): void
    {
        abort_code_if($this->route('setting')->scope === SettingScope::Global, 422, 'setting.global_not_writable');
    }
}
