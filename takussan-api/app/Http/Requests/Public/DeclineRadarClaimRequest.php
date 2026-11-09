<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use App\Services\Radar\ClaimDecline;
use Illuminate\Validation\Rule;

/**
 * TCK-2511 — `POST /api/radar/claims/{token}/decline`. Le seul champ est le motif : « Ce n'est pas moi » (`not_me`) ou
 * « Ne plus me contacter » (`stop_contact`). Ni code ni compte : le lien est l'autorisation ({@see ClaimDecline}).
 */
class DeclineRadarClaimRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', Rule::in(ClaimDecline::REASONS)],
        ];
    }
}
