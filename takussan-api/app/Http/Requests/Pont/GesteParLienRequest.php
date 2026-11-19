<?php

namespace App\Http\Requests\Pont;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\ConvertitLesInstantsRecus;
use App\Http\Requests\InventorySignRequest;
use App\Http\Requests\SignatureDataUrlRule;
use App\Rules\DansLHorizonDuPassage;
use App\Rules\InstantIso;

/**
 * TCK-2982 (ADR-0132 § 5) — `POST /api/a/{token}` : le geste d'un lien d'action, avec ses paramètres.
 *
 * Route publique, SANS session : le jeton est l'autorisation, jugé par le contrôleur (empreinte, vie,
 * usage unique), puis la politique de l'objet rejugée pour le compte du lien. `authorize()` rend donc
 * vrai : aucune identité à juger ici. Les règles sont celles des routes du geste (`scheduled_at` de
 * `ConfirmPropertyVisitRequest` et `AcceptMaintenanceRequestRequest`, `signature` et `code` de
 * `InventorySignRequest`).
 */
class GesteParLienRequest extends BaseFormRequest
{
    use ConvertitLesInstantsRecus;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'scheduled_at' => ['sometimes', 'nullable', 'date', new InstantIso, 'after:now', new DansLHorizonDuPassage],
            // Signer : les règles de `InventorySignRequest` ; le code est exigé par le geste (`GestesParLien`).
            'signature' => ['sometimes', 'string', 'max:'.InventorySignRequest::MAX_SIGNATURE_BYTES, new SignatureDataUrlRule],
            'code' => ['sometimes', 'nullable', 'string', 'regex:/^\d{6}$/'],
        ];
    }

    /** TCK-2743 — {@see ConvertitLesInstantsRecus} : le créneau est un instant, ramené en UTC par `InstantRecu`. */
    protected function instantsRecus(): array
    {
        return ['scheduled_at'];
    }
}
