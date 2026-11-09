<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\AgencySpotlight;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * TCK-2520 (ADR-0092) — offrir la place « Mise en avant » de l'annuaire d'une ville : l'agence, la
 * ville (`null` : l'annuaire sans filtre), la période et le motif. Un chevauchement avec une autre
 * place de la même ville rend 422 sur `starts_at`, lisible ; la contrainte d'exclusion de la base
 * reste l'arbitre d'une course (le contrôleur la traduit en la même erreur).
 */
class StoreAgencySpotlightRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'agency_id' => ['required', 'integer', Rule::exists('agencies', 'id')->whereNull('deleted_at')],
            'geo_city_id' => ['present', 'nullable', 'integer', Rule::exists('geo_cities', 'id')],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'note' => ['required', 'string', 'min:5', 'max:255'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            if ($v->errors()->isNotEmpty()) {
                return;
            }
            $ville = $this->input('geo_city_id') !== null ? (int) $this->input('geo_city_id') : null;
            [$debut, $fin] = $this->periode();
            if (AgencySpotlight::query()->overlapping($ville, $debut, $fin)->exists()) {
                $v->errors()->add('starts_at', __('credits.spotlight.overlap'));
            }
        });
    }

    /**
     * La période, ramenée en UTC. Les colonnes sont des `timestamp` SANS fuseau : un décalage
     * (`+02:00`) gardé tel quel serait rangé en heure murale, décalage jeté, et deux places
     * disjointes en temps réel se chevaucheraient en base (revue de TCK-2520).
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public function periode(): array
    {
        return [
            Carbon::parse($this->input('starts_at'))->utc(),
            Carbon::parse($this->input('ends_at'))->utc(),
        ];
    }
}
