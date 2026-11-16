<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\GeoNeighborhood;

/** TCK-2844 (ADR-0109 §1) — envoyer la photo d'un quartier : JPEG, PNG ou WebP, 10 Mo au plus. */
class GeoCoverUploadRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['file' => ['required', 'file', 'image', 'mimes:jpeg,png,webp', 'mimetypes:'.implode(',', GeoNeighborhood::COVER_MIMES), 'max:'.GeoNeighborhood::COVER_MAX_KO]];
    }
}
