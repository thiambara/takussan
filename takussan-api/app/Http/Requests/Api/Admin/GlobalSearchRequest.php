<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Services\Admin\AdminGlobalSearchService;

/**
 * TCK-600 (S19) — `GET /api/admin/search?q=`. L'autorisation est le geste `platform.search.global`
 * posé sur la route (ADR-0047) ; ici, la seule forme de la requête.
 */
class GlobalSearchRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Le minimum est le seuil du texte libre (`FREE_TEXT_MIN`, 3) : en dessous, aucune voie du
     * service ne peut répondre, et une liste vide se lirait « personne de ce nom » (TCK-1447).
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['q' => ['required', 'string', 'min:'.AdminGlobalSearchService::FREE_TEXT_MIN, 'max:100']];
    }
}
