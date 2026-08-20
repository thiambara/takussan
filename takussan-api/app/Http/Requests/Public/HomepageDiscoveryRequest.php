<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use App\Services\Property\HomepageDiscoveryService;

/**
 * TCK-247 — query contract of `GET /api/public/properties/discovery`.
 */
class HomepageDiscoveryRequest extends BaseFormRequest
{
    /**
     * Public endpoint. {@see BaseFormRequest} is fail-closed, so this override
     * is what opens it.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Free text: it comes from the visitor's IP geolocation and can name
            // any city on earth. A city the catalogue has never heard of is not
            // an error — it is the nominal input of the fallback path.
            'near_city' => ['nullable', 'string', 'max:100'],
            'per_row' => ['nullable', 'integer', 'min:1', 'max:'.HomepageDiscoveryService::MAX_PER_ROW],
        ];
    }

    /**
     * The city guessed for the visitor, or `null` when we have no idea where
     * they are. `null` is NOT the same as "a city we have nothing for": the
     * service tells the two apart in its response.
     */
    public function nearCity(): ?string
    {
        $city = $this->validated('near_city');

        return is_string($city) && $city !== '' ? $city : null;
    }

    public function perRow(): int
    {
        return (int) ($this->validated('per_row') ?? HomepageDiscoveryService::DEFAULT_PER_ROW);
    }
}
