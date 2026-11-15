<?php

namespace App\Services\Payments;

use App\Models\Agency;

/**
 * TCK-2504, TCK-2649 — comment payer une agence HORS LIGNE : les moyens qu'elle déclare
 * (`AgencySettings`, `offline_payment_*`) et son téléphone. Les champs vides sont omis ; rien de
 * déclaré → `null`.
 *
 * Une seule lecture pour le lien de paiement (`GET /api/pay/{jeton}`, bloc `offline_payment`) et le
 * résumé du locataire (`GET /api/me/rent-summary`) : deux copies auraient divergé au premier moyen
 * ajouté.
 *
 * L'agence n'a aucun numéro WhatsApp déclaré (ni colonne ni réglage, relevé 2026-11-09) :
 * `agency_whatsapp` n'a pas de source et n'est jamais rendu.
 */
final class OfflinePaymentMeans
{
    /** @return array<string, string>|null */
    public static function of(?Agency $agency): ?array
    {
        if ($agency === null) {
            return null;
        }

        $fields = array_filter([
            'wave_number' => $agency->setting('offline_payment_wave_number'),
            'orange_money_number' => $agency->setting('offline_payment_orange_money_number'),
            'bank_details' => $agency->setting('offline_payment_bank_details'),
            'agency_phone' => $agency->phone,
        ], fn ($value) => is_string($value) && $value !== '');

        return $fields === [] ? null : $fields;
    }
}
