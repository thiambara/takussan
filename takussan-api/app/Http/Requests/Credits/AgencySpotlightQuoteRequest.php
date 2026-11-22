<?php

namespace App\Http\Requests\Credits;

use App\Http\Requests\BaseFormRequest;
use App\Rules\JourIso;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — la ville (`null` : l'annuaire sans ville) et le
 * jour de début souhaité (`YYYY-MM-DD`, minuit à Dakar ; absent ou aujourd'hui : tout de suite) d'une
 * mise en avant de l'agence. Autorisée comme la lecture du portefeuille : `boost.spend` sur l'espace
 * actif, jugée avant la validation.
 */
class AgencySpotlightQuoteRequest extends BaseFormRequest
{
    use AuthorizesWalletReading;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'geo_city_id' => ['nullable', 'integer', Rule::exists('geo_cities', 'id')],
            'starts_on' => ['nullable', 'date_format:Y-m-d', new JourIso, 'after_or_equal:today'],
        ];
    }

    public function geoCityId(): ?int
    {
        return $this->filled('geo_city_id') ? (int) $this->input('geo_city_id') : null;
    }

    /** Minuit UTC (l'heure de Dakar, sans heure d'été) du jour demandé. */
    public function requestedStart(): ?Carbon
    {
        return $this->filled('starts_on') ? Carbon::createFromFormat('Y-m-d H:i:s', $this->input('starts_on').' 00:00:00', 'UTC') : null;
    }
}
