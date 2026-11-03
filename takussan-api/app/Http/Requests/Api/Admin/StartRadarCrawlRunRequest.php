<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-2392 — lancer un passage de collecte : aucun champ, le site est dans la route. */
class StartRadarCrawlRunRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.publish` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
