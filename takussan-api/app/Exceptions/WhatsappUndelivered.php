<?php

namespace App\Exceptions;

use App\Jobs\SendSavedSearchAlerts;
use App\Notifications\Channels\WhatsappChannel;
use RuntimeException;

/**
 * P179.02 (TCK-1795) — le fournisseur WhatsApp a refusé le message, sans ambiguïté, et aucun autre
 * canal ne le porte.
 *
 * Levée par {@see WhatsappChannel} pour la seule notification qui le demande
 * (`throwsWhenWhatsappFails()`), afin que son appelant voie l'échec : sans elle, le canal rend un
 * tableau de résultats et {@see SendSavedSearchAlerts} garde une réservation que rien n'a servie.
 * Le message ne cite jamais le destinataire.
 */
class WhatsappUndelivered extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('whatsapp_undelivered');
    }
}
