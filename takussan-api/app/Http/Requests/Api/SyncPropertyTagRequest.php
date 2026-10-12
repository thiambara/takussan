<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PropertyTagController::sync(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class SyncPropertyTagRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * **Simple DÉLÉGATION** : la règle vit dans sa policy, cette méthode ne fait que l'invoquer —
     * aucune règle d'autorisation n'a migré ici (AC4).
     */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $user = $this->user();
        /** @var Property|null $bien */
        $bien = $this->route('property');

        return [
            'tag_ids' => ['present', 'array'],
            'tag_ids.*' => [
                'integer',
                // TCK-633 — même règle que les quartiers (`GeoAddressRules`) : un équipement se
                // désigne par identifiant s'il est approuvé, ou s'il est une proposition DE
                // L'APPELANT — jamais la proposition d'un autre, qui sortirait sur une fiche avant
                // toute modération (D9). Une proposition déjà portée par CE bien se garde : partagée
                // par son nom (`TagProposals`), le formulaire la renvoie par identifiant. Un refusé
                // ne s'attache jamais.
                Rule::exists('tags', 'id')->where(fn ($q) => $q
                    ->where('type', TagType::Amenity->value)
                    ->where(function ($q) use ($user, $bien) {
                        $q->where('status', ReferentialStatus::Approved->value);
                        if ($user !== null) {
                            $q->orWhere(fn ($q) => $q
                                ->where('status', ReferentialStatus::Pending->value)
                                ->where('created_by_id', $user->id));
                        }
                        if ($bien instanceof Property) {
                            $q->orWhere(fn ($q) => $q
                                ->where('status', ReferentialStatus::Pending->value)
                                ->whereIn('id', DB::table('taggables')
                                    ->select('tag_id')
                                    ->where('taggable_type', Property::class)
                                    ->where('taggable_id', $bien->getKey())));
                        }
                    })),
            ],
            // TCK-633 (ADR-0062 §7) — les équipements TAPÉS, absents de la liste : des propositions.
            'tag_names' => ['sometimes', 'array', 'max:20'],
            'tag_names.*' => ['nullable', 'string', 'max:100'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'tag_ids.*.exists' => __('validation.exists', ['attribute' => 'tag_ids']),
        ];
    }
}
