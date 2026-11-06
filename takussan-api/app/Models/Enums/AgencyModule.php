<?php

namespace App\Models\Enums;

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — les modules qu'un admin d'agence
 * `standard` peut masquer du menu de son personnel (`agencies.settings.hidden_modules`).
 *
 * AFFICHAGE seulement : aucun code de l'API ne lit ce réglage pour décider d'un droit. Le front
 * associe chaque cas aux destinations de son catalogue (`takussan-web/src/lib/navigation/modules.ts`),
 * et `modules.parity.test.ts` y lit CE fichier : un cas ajouté ici sans le front rougit là-bas.
 */
enum AgencyModule: string
{
    case Commissions = 'commissions';
    case Inventories = 'inventories';
    case MoveInFollowUp = 'move_in_follow_up';
    case ProviderBook = 'provider_book';
    case Calendar = 'calendar';
    case Credits = 'credits';
    case Analytics = 'analytics';
}
