<?php

namespace App\Http\Requests;

use Illuminate\Http\Request;

/**
 * TCK-250 — Validates the body for `PUT /api/me/wizard-drafts/{key}`.
 *
 * `step` is a non-negative small int; `data` is an opaque JSON bag (per
 * the contract — see `WizardDraft` and TCK-250 strict business
 * constraints — no sensitive payload allowed at consumer level).
 *
 * TCK-574 — **`data` est stocké tel qu'il arrive, sans normalisation.** Un brouillon est une
 * saisie EN COURS : `''` (un champ pré-rempli que la personne a vidé) et une espace finale
 * (« Rue de la ») sont ce qu'elle a laissé, et la reprise doit les lui rendre. Trois mécanismes
 * les réécrivaient, chacun suffisant à lui seul : `TrimStrings` et `ConvertEmptyStringsToNull`
 * (middleware global, exemptés par {@see self::estEcritureDeBrouillon()} dans
 * `bootstrap/app.php`) et `BaseFormRequest::prepareForValidation()` (neutralisé ci-dessous).
 * La donnée est normalisée plus tard, par la route qui la valide pour de bon à la soumission.
 */
class UpsertWizardDraftRequest extends BaseFormRequest
{
    /**
     * Le middleware global court AVANT le routage : la route n'est pas encore résolue, seul le
     * chemin se lit. Un `PUT` ne vise ce préfixe que pour écrire un brouillon (`routes/api/me.php`).
     */
    public static function estEcritureDeBrouillon(Request $request): bool
    {
        return $request->isMethod('PUT') && $request->is('api/me/wizard-drafts/*');
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Rien à normaliser : `step` est un entier validé tel quel, et `data` est opaque.
     */
    protected function prepareForValidation(): void {}

    public function rules(): array
    {
        return [
            'step' => ['required', 'integer', 'min:0', 'max:65535'],
            'data' => ['nullable', 'array'],
        ];
    }
}
