<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-633 (AC9) — un lien collé dans le formulaire du bien.
 *
 * TCK-2599 (ADR-0093) — servie aussi par `POST /api/public/geo/resolve-link`, sans compte. Le
 * compte n'est donc plus exigé ICI : la route connectée le garde par `auth:sanctum`, qui court
 * avant ce FormRequest, et la porte publique par son limiteur par IP. Aucune ressource n'est en
 * jeu — la garde est la liste d'hôtes de `GeoLinkResolver`, la même pour les deux.
 */
class GeoResolveLinkRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['url' => ['required', 'string', 'max:2048', 'url:https']];
    }
}
