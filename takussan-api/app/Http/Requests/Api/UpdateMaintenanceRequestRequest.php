<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de MaintenanceRequestController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateMaintenanceRequestRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * **Simple DÉLÉGATION** : la règle vit dans sa policy, cette méthode ne fait que l'invoquer —
     * aucune règle d'autorisation n'a migré ici (AC4). TCK-445 en ajoute une SECONDE, toujours
     * par délégation : `actAsPrincipal`, pour les seuls champs du donneur d'ordre.
     */
    /**
     * TCK-445 — les deux champs du DONNEUR D'ORDRE.
     *
     * Ils ne sont pas retirés du corps en silence : les porter sans le droit est un **403**,
     * pas un champ ignoré sans le dire (contrainte métier du ticket). D'où la garde ici et non
     * dans `rules()` — une règle de validation rendrait 422, et un `unset()` en contrôleur
     * rendrait 200 sur un geste refusé.
     */
    public const PRINCIPAL_FIELDS = ['assigned_to', 'priority'];

    public function authorize(): bool
    {
        $user = $this->user();
        $maintenanceRequest = $this->route('maintenanceRequest');

        if ($user?->can('update', $maintenanceRequest) !== true) {
            return false;
        }

        // La PRÉSENCE du champ suffit à exiger le droit, même si la valeur postée est celle
        // déjà en base : comparer les valeurs ferait dépendre le droit de l'état courant, et
        // un prestataire pourrait sonder ce qu'il n'a pas le droit d'écrire.
        if (! $this->hasAny(self::PRINCIPAL_FIELDS)) {
            return true;
        }

        return $user->can('actAsPrincipal', $maintenanceRequest) === true;
    }

    /**
     * TCK-474 — `resolution_report` est `prohibited`, et ce n'est pas un oubli de règle.
     *
     * Le champ était validé `['sometimes', 'nullable', 'string']` et `$fillable` sur le
     * modèle, mais **aucune migration ne crée la colonne** : le `PATCH` qui le portait
     * traversait la validation puis mourait à l'UPDATE en **500** (`SQLSTATE[42703]`).
     * Le ticket a tranché le RETRAIT et non la création de la colonne — `docs/models-spec.md`
     * ne déclare que `resolution_notes`, `MaintenanceRequestResource` n'expose que
     * `resolution_notes`, et le front n'envoie jamais `resolution_report`. Créer la colonne
     * aurait laissé le code décider du schéma, sur un champ dont `docs/backend-gap-report.md`
     * décrit encore la forme (texte libre ? structure ? média dédié ?) comme non tranchée.
     *
     * ⚠ Le retirer PUREMENT ET SIMPLEMENT des règles aurait rendu **200 en avalant la
     * valeur en silence** — pour le client qui joint son rapport, c'est aussi trompeur que
     * le 500. `prohibited` rend un 422 qui NOMME le champ. Même geste que
     * `RenewLeaseRequest`.
     *
     * ⚠ `prohibited` laisse passer une valeur VIDE (`null`, `""`) : envoyer « rien » n'est
     * pas demander une écriture, et un corps généré côté client qui porte la clé à null
     * n'a pas à être refusé.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
            'priority' => ['sometimes', Rule::enum(MaintenancePriority::class)],
            'status' => ['sometimes', Rule::enum(MaintenanceStatus::class)],
            'estimated_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'actual_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'scheduled_at' => ['sometimes', 'nullable', 'date'],
            'started_at' => ['sometimes', 'nullable', 'date'],
            'completed_at' => ['sometimes', 'nullable', 'date'],
            'resolution_notes' => ['sometimes', 'nullable', 'string'],
            'resolution_report' => ['prohibited'],
        ];
    }
}
