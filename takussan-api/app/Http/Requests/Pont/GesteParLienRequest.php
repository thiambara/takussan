<?php

namespace App\Http\Requests\Pont;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\ConvertitLesInstantsRecus;
use App\Http\Requests\InventorySignRequest;
use App\Http\Requests\SignatureDataUrlRule;
use App\Models\ActionLink;
use App\Rules\DansLHorizonDuPassage;
use App\Rules\InstantIso;
use App\Services\Pont\LiensDAction;
use LogicException;

/**
 * TCK-2982 (ADR-0132 § 5) — `POST /api/a/{token}` : le geste d'un lien d'action, avec ses paramètres.
 *
 * Route publique, SANS session : le jeton est l'autorisation. `authorize()` le juge (empreinte, vie, objet), puis
 * le contrôleur le rejuge sous verrou et rejuge la politique de l'objet pour le compte du lien. Les règles sont celles des routes du geste (`scheduled_at` de
 * `ConfirmPropertyVisitRequest` et `AcceptMaintenanceRequestRequest`, `signature` et `code` de
 * `InventorySignRequest`).
 */
class GesteParLienRequest extends BaseFormRequest
{
    use ConvertitLesInstantsRecus;

    private ?ActionLink $lien = null;

    /** @return list<string> */
    protected function instantsRecus(): array
    {
        return ['scheduled_at'];
    }

    /**
     * Le lien est résolu ICI, avant la validation : un lien mort ou inconnu rend 410 / 404 et son seul code, jamais
     * un 422 qui nommerait des champs (le piège 2 de `takussan-api/CLAUDE.md`, § Validation).
     */
    public function authorize(): bool
    {
        $liens = app(LiensDAction::class);
        $this->lien = $liens->lienVivant($liens->trouver((string) $this->route('token')));
        $liens->objetVivant($this->lien);

        return true;
    }

    public function lien(): ActionLink
    {
        return $this->lien ?? throw new LogicException('Le lien est résolu par authorize().');
    }

    /**
     * Par le geste du lien. Hors contexte (sans `authorize()`, ce que fait le recensement des règles), aucun lien,
     * donc aucune règle : sur la route, `authorize()` passe toujours avant `rules()`.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return match ($this->lien?->gesture) {
            // Les règles de `ConfirmPropertyVisitRequest` et `AcceptMaintenanceRequestRequest`.
            'property_visit.confirm', 'maintenance_request.accept' => [
                'scheduled_at' => ['sometimes', 'nullable', 'date', new InstantIso, 'after:now', new DansLHorizonDuPassage],
            ],
            // Celles d'`InventorySignRequest` : la signature EXIGÉE ; le code est exigé par le geste
            // (`GestesParLien`), qui dit `action_link.code_required`.
            'inventory.sign' => [
                'signature' => ['required', 'string', 'max:'.InventorySignRequest::MAX_SIGNATURE_BYTES, new SignatureDataUrlRule],
                'code' => ['sometimes', 'nullable', 'string', 'regex:/^\d{6}$/'],
            ],
            default => [],
        };
    }
}
