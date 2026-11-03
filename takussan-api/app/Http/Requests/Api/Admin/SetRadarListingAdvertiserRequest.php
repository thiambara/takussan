<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Support\RadarPhone;

/**
 * TCK-2387 (AC6) — le numéro à promouvoir en annonceur, écrit comme on veut. Il doit se lire comme un numéro
 * sénégalais (422 `radar.advertiser.phone_invalid`) ; qu'il soit CONNU de l'annonce se juge sous le verrou de
 * l'annonce (`RadarListingReview::setAdvertiser()`).
 */
class SetRadarListingAdvertiserRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route, comme la saisie. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['phone' => ['required', 'string', 'max:40']];
    }

    protected function passedValidation(): void
    {
        abort_code_if(RadarPhone::canonical((string) $this->validated('phone')) === null, 422, 'radar.advertiser.phone_invalid');
    }

    /** Le numéro en E.164 (`+221XXXXXXXXX`) : la forme que le Radar compare et empreint. */
    public function e164(): string
    {
        return (string) RadarPhone::canonical((string) $this->validated('phone'));
    }
}
