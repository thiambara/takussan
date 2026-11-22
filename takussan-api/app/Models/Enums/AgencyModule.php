<?php

namespace App\Models\Enums;

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — les modules qu'un admin d'agence
 * `standard` peut masquer du menu de son personnel (`agencies.settings.hidden_modules`).
 *
 * AFFICHAGE seulement : aucun code de l'API ne lit ce réglage pour décider d'un droit. Le front
 * associe chaque cas aux destinations de son catalogue (`takussan-web/src/lib/navigation/modules.ts`),
 * et `modules.parity.test.ts` y lit CE fichier : un cas ajouté ici sans le front rougit là-bas.
 *
 * TCK-2644 (ADR-0089, amendement du 2026-11-10, point 4) — `move_in_follow_up` est retiré : « Entrées
 * en attente » est devenu l'onglet « En attente du locataire » de la liste des baux. Une valeur déjà
 * enregistrée est ignorée à la lecture (`AgencySettings::read()`, `knownCases`).
 */
enum AgencyModule: string
{
    case Commissions = 'commissions';
    case Inventories = 'inventories';
    case ProviderBook = 'provider_book';
    case Calendar = 'calendar';
    case Credits = 'credits';
    case Analytics = 'analytics';
}
