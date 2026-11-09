<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2507 — « j'ai ouvert cette recherche » : pose `saved_searches.last_viewed_at`.
 *
 * L'autorisation court ICI, avant toute validation. La recherche d'un autre rend **404**, pas 403 (AC3) : la route
 * ne doit pas dire qu'un identifiant existe chez quelqu'un d'autre. ⚠ REPRISE de l'expression
 * d'`UpdateSavedSearchRequest::authorize()` — il n'existe pas de `SavedSearchPolicy` (mesuré le 2026-11-09) ; le
 * ticket qui la créera convertira les deux en délégation.
 */
class MarkSavedSearchViewedRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        abort_unless($this->route('savedSearch')?->user_id === $this->user()?->id, 404);

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
