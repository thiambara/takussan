<?php

namespace App\Services\Radar\Whatsapp;

use App\Services\Notifications\Whatsapp\WhatsappResult;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * TCK-2395 — le pilote par défaut du numéro du Radar : AUCUN appel réseau. Il journalise le gabarit (jamais le numéro
 * en clair ni les paramètres, qui portent le résumé des annonces) et rend un identifiant fictif `wamid.log_…`, pour
 * que le parcours s'exerce en développement comme le pilote `log` des SMS.
 */
final class RadarLogWhatsappDriver implements RadarWhatsappDriver
{
    public function sendTemplate(string $to, WhatsappTemplateRef $template, string $callbackData): WhatsappResult
    {
        $messageId = 'wamid.log_'.Str::uuid()->toString();
        Log::info('[radar.whatsapp-log-driver] dispatched', [
            // Les 4 derniers chiffres seuls, comme la vue du journal des webhooks.
            'to' => '••••'.substr($to, -4),
            'template' => $template->name,
            'language' => $template->language,
            'params' => count($template->params),
            'provider_message_id' => $messageId,
        ]);

        return WhatsappResult::sent($to, self::PROVIDER, $messageId);
    }
}
