<?php

namespace App\Http\Requests\Credits;

use App\Rules\JourIso;
use Illuminate\Validation\Rule;

/**
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — acheter la mise en avant de l'agence : mêmes champs
 * que le devis, `geo_city_id` présent (nul : l'annuaire sans ville). L'espace est l'espace ACTIF,
 * jamais un identifiant du corps ; la capacité est `boost.spend` (réutilisée, pas déclinée).
 */
class StoreAgencySpotlightPurchaseRequest extends AgencySpotlightQuoteRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'geo_city_id' => ['present', 'nullable', 'integer', Rule::exists('geo_cities', 'id')],
            'starts_on' => ['nullable', 'date_format:Y-m-d', new JourIso, 'after_or_equal:today'],
        ];
    }

    /** L'en-tête `Idempotency-Key`, que le dialogue d'achat génère à son ouverture (comme TCK-822). */
    public function idempotencyKey(): ?string
    {
        $key = $this->header('Idempotency-Key');

        return is_string($key) && trim($key) !== '' ? trim($key) : null;
    }
}
