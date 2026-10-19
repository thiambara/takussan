<?php

namespace App\Http\Requests\Api;

use App\Domain\Settings\EditablePlatformSettings;
use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\SettingScope;
use App\Support\ScopedSetting;
use Illuminate\Support\Facades\Validator as ValidatorFactory;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * TCK-305 — extrait de SettingController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 *
 * TCK-964 (P47.04) — une ligne d'agence obéit au catalogue : sa clé est un réglage métier à repli
 * par agence (catégorie `rentals`, ADR-0065), et sa valeur, déballée comme `ScopedSetting` la
 * lira, passe les `rules` et l'`item_rules` de la clé. Elle l'emporte sur la ligne globale, que le
 * catalogue bornait seule.
 */
class StoreSettingRequest extends BaseFormRequest
{
    /**
     * TCK-964 — l'autorisation de `SettingController::store` court ICI, avant la validation : la
     * règle du catalogue rendait sinon 422 à qui n'a aucun droit, et lui nommait les clés admises
     * (`takussan-api/CLAUDE.md`, « Validation », piège 2). Mêmes règles et mêmes codes qu'avant :
     * la portée globale au seul super-admin (que le contrôleur refuse ensuite en 422), la portée
     * agence à l'admin de l'agence visée.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        if ($this->input('scope') === SettingScope::Global->value) {
            abort_code_unless($user->isSuperAdmin(), 403, 'setting.global_forbidden');

            return true;
        }

        $targetAgencyId = $this->input('scope_id') ?? $user->agency_id;
        abort_code_unless(
            $user->isSuperAdmin() || ($user->agency_id !== null && $user->agency_id === $targetAgencyId && $user->isAgencyAdminAt((int) $targetAgencyId)),
            403,
            'setting.other_agency_forbidden'
        );

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'key' => ['required', 'string', 'max:255'],
            'value' => ['required', 'array'],
            'scope' => ['required', Rule::enum(SettingScope::class)],
            'scope_id' => ['nullable', 'integer'],
        ];
    }

    /** @return array<int, callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty() || $this->input('scope') !== SettingScope::Agency->value) {
                return;
            }

            $key = (string) $this->input('key');
            if (! EditablePlatformSettings::has($key) || EditablePlatformSettings::get($key)['category'] !== 'rentals') {
                $validator->errors()->add('key', 'setting_key_not_editable');

                return;
            }

            $definition = EditablePlatformSettings::get($key);
            $value = ValidatorFactory::make(
                ['value' => ScopedSetting::unwrap($key, $this->input('value'))],
                ['value' => $definition['rules'], 'value.*' => $definition['item_rules'] ?? ['nullable']],
            );
            foreach ($value->errors()->all() as $message) {
                $validator->errors()->add('value', $message);
            }
        }];
    }
}
