<?php

namespace App\Http\Requests\Api\Me;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-253 — Partial update for the authenticated user's lightweight
 * personalisation fields. All fields are optional; only the supplied
 * keys are persisted.
 */
class UpdateMeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Les champs qui vivent dans la colonne JSON `preferences`.
     *
     * ⚠ **TCK-493 — cette constante existe pour n'être écrite qu'UNE fois.** La
     * liste était en double : ici, dans `rules()`, et là-bas dans la boucle
     * `foreach (['city', 'search_intent'])` de {@see MeController::update()}.
     * Ajouter une clé à la validation sans l'ajouter à la boucle produit le
     * pire des cas — la requête est ACCEPTÉE (200), rien n'est enregistré, et
     * aucune erreur ne le dit. C'est le motif de recopie que TCK-492 et TCK-498
     * viennent de payer deux fois sur les rôles ; on ne le laisse pas s'installer
     * ici.
     *
     * @var list<string>
     */
    public const PREFERENCE_FIELDS = ['city', 'search_intent', 'entry_intent'];

    public function rules(): array
    {
        return [
            // Same E.164 contract as UpdateProfileRequest. Empty string is
            // accepted and treated as "clear" by the controller.
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^(?:\+[1-9]\d{6,14})?$/'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            // Free-form enum at the API layer — stored as a string. The
            // ranking pipeline (out of scope here, see TCK-253 hors-périmètre)
            // is the consumer that interprets the value.
            'search_intent' => ['sometimes', 'nullable', 'string', 'in:rent,buy,both'],
            // TCK-493 — la réponse à la question d'orientation posée juste après
            // la création du compte. Elle ORIENTE et n'attribue rien : aucun
            // profil n'est créé, aucune capacité accordée. `skipped` est une
            // réponse à part entière — c'est elle qui empêche de reposer la
            // question à quelqu'un qui a choisi de passer.
            'entry_intent' => ['sometimes', 'nullable', 'string', 'in:search,publish,skipped'],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => 'Le numéro doit être au format international E.164 (ex : +221770000000).',
        ];
    }
}
