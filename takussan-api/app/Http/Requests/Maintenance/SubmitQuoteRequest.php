<?php

namespace App\Http\Requests\Maintenance;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-592 (P12) — un devis structuré : des lignes (main-d'œuvre ou fourniture, quantité, prix
 * unitaire), une date de validité, une durée estimée.
 *
 * Le montant et la devise ne s'envoient plus. `amount` était saisi librement et `currency` aussi
 * (placeholder « XOF, EUR... ») : le montant est désormais CALCULÉ depuis les lignes, la devise
 * IMPOSÉE (celle du bail, sinon de l'agence — `MaintenanceQuoteWorkflow::resolveCurrency()`).
 * Les envoyer rend 422, pour qu'un client qui croit les fixer l'apprenne.
 */
class SubmitQuoteRequest extends FormRequest
{
    /** Le prestataire assigné, et lui seul — avant la validation (403 avant 422). */
    public function authorize(): bool
    {
        return $this->user()?->can('actAsProvider', $this->route('maintenanceRequest')) === true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'amount' => ['prohibited'],
            'currency' => ['prohibited'],
            'lines' => ['required', 'array', 'min:1', 'max:50'],
            'lines.*.label' => ['required', 'string', 'max:200'],
            'lines.*.kind' => ['required', 'string', 'in:labour,supply'],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:100000', 'decimal:0,2'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0', 'max:1000000000', 'decimal:0,2'],
            'valid_until' => ['required', 'date', 'after_or_equal:today'],
            'estimated_duration_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'attachments' => ['nullable', 'array', 'max:5'],
            // TCK-592 — PDF ou image SEULEMENT. Sans `mimes`, tout fichier partait dans `quotes`, et la
            // sortie privée sert un média avec son type, en `inline` : un `.html` ou un `.svg` déposé
            // par un prestataire se serait ouvert dans le navigateur de l'agence le jour où la fiche
            // expose `media.quotes`.
            'attachments.*' => ['file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:5120'], // 5MB max
        ];
    }
}
