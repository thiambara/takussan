<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Lease;
use App\Models\Property;

/**
 * TCK-2643 — `GET /api/leases/defaults?property_id=` : l'autorisation avant tout, et la même que la
 * création (`LeasePolicy::createOn`). Un bien absent, un identifiant mal formé ou manquant rendent
 * le refus d'un bien étranger — 403, jamais 404 ni 422 : la route ne doit pas devenir l'oracle
 * d'existence que TCK-1068 a fermé sur `POST /api/leases`.
 */
class LeaseDefaultsRequest extends BaseFormRequest
{
    private ?Property $property = null;

    public function authorize(): bool
    {
        $id = filter_var($this->query('property_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $this->property = $id === false ? null : Property::query()->find($id);

        return $this->property !== null && $this->user()?->can('createOn', [Lease::class, $this->property]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'property_id' => ['required', 'integer'],
        ];
    }

    /** Le bien jugé par `authorize()` : il n'est pas relu. */
    public function property(): Property
    {
        return $this->property ?? abort(403);
    }
}
