<?php

namespace App\Services\Radar\Whatsapp;

use App\Services\Notifications\Whatsapp\WhatsappResult;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;

/**
 * TCK-2395 (ADR-0077 §5) — le pilote d'envoi du numéro dédié au Radar. **Il ne partage rien avec celui des
 * notifications** (`WhatsappDriverInterface`, l'intégration `whatsapp_cloud`) : seuls les objets valeur du message
 * (`WhatsappTemplateRef`) et du résultat (`WhatsappResult`) sont communs. Lié par `config('radar_whatsapp.driver')`.
 */
interface RadarWhatsappDriver
{
    /** Le fournisseur, tel que le journal des webhooks et les messages l'écrivent. */
    public const PROVIDER = 'whatsapp_cloud_radar';

    /**
     * Envoie un gabarit approuvé, seul message qu'une entreprise peut écrire en premier (politique de Meta).
     *
     * @param  string  $to  le numéro de l'annonceur, en E.164
     */
    public function sendTemplate(string $to, WhatsappTemplateRef $template): WhatsappResult;
}
