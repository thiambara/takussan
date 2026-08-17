<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Customer;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Property;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de TaskController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreTaskRequest extends BaseFormRequest
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

    /**
     * TCK-305 — les deux modèles auxquels une tâche peut se rattacher ; ils vivaient en
     * `private const` sur le contrôleur, donc hors de portée des règles une fois déplacées.
     *
     * @var list<class-string>
     */
    public const TASKABLE_TYPES = [
        Property::class,
        Customer::class,
    ];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'taskable_id' => ['required', 'integer'],
            'taskable_type' => ['required', 'string', Rule::in(self::TASKABLE_TYPES)],
            'assigned_to_id' => ['nullable', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
            'status' => ['nullable', Rule::enum(TaskStatus::class)],
            'priority' => ['nullable', Rule::enum(TaskPriority::class)],
        ];
    }
}
