<?php

/*
|--------------------------------------------------------------------------
| Radar — le numéro WhatsApp dédié au démarchage (TCK-2395, ADR-0077 §5)
|--------------------------------------------------------------------------
| **Un numéro distinct de celui des notifications.** Celui des notifications vit dans l'intégration
| `whatsapp_cloud` (`config/whatsapp.php`, `IntegrationLocator`) ; celui du Radar vit ICI, et nulle part
| ailleurs : son pilote ne lit que ces clés, et refuse un identifiant de numéro égal à celui d'une
| intégration des notifications (`App\Services\Radar\Whatsapp\RadarWhatsappNumber`). Le blocage du
| numéro du Radar pour « spam » ne coupe donc jamais les notifications des baux.
|
| Tout est VIDE par défaut, et le pilote est `log` : rien ne part tant que le porteur n'a pas créé le
| numéro et l'application Meta du Radar, puis posé ces variables (prérequis de TCK-2395).
*/

return [

    /**
     * `log` (défaut) : journalise et rend un identifiant fictif, aucun appel réseau. `cloud` : l'API
     * Graph de Meta, sur le numéro ci-dessous. Se pose à `cloud` en dernier, une fois le reste posé.
     */
    'driver' => env('RADAR_WHATSAPP_DRIVER', 'log'),

    /** L'identifiant du numéro du Radar dans l'application Meta du Radar (`phone_number_id`). */
    'phone_number_id' => env('RADAR_WHATSAPP_PHONE_NUMBER_ID', ''),

    /** Le jeton d'utilisateur système de l'application Meta du Radar. */
    'access_token' => env('RADAR_WHATSAPP_ACCESS_TOKEN', ''),

    /**
     * Le webhook du Radar (`webhooks/whatsapp/radar/{token}`), gardé comme celui des notifications et
     * ÉCHOUANT FERMÉ : jeton d'URL vide → 404, secret de l'application vide → tout message refusé (403),
     * jeton de vérification vide → l'abonnement de Meta refusé (403).
     */
    'webhook_url_token' => env('RADAR_WHATSAPP_WEBHOOK_URL_TOKEN', ''),
    'webhook_app_secret' => env('RADAR_WHATSAPP_WEBHOOK_APP_SECRET', ''),
    'webhook_verify_token' => env('RADAR_WHATSAPP_WEBHOOK_VERIFY_TOKEN', ''),

    /**
     * Un texte reçu qui vaut exactement STOP (aux espaces, à la casse et à la ponctuation finale près) révoque l'annonceur
     * dès la réception (ADR-0081). `false` : il reste une réponse que l'opérateur tranche.
     */
    'auto_stop' => (bool) env('RADAR_WHATSAPP_AUTO_STOP', true),

    /**
     * Le gabarit Meta approuvé de chaque version de clauses (`radar_outreaches.clauses_version`). Son corps
     * est le fichier de clauses où chaque marqueur devient `{{1}}`, `{{2}}`… dans l'ordre :
     * `php artisan radar:whatsapp-template <langue>` l'imprime. Une version absente ne s'envoie pas par
     * l'API (`radar.whatsapp.template_missing`) : ni `accord.v1` ni `accord.v2` — leur corps s'ouvre sur `{{1}}`, ce que
     * Meta refuse ; `accord.v3` s'ouvre sur un texte fixe.
     */
    'templates' => [
        'accord.v3' => 'takussan_radar_accord_v3',
    ],

    /** La langue Meta du gabarit, par langue du message. */
    'template_languages' => [
        'fr' => 'fr',
        'en' => 'en',
    ],

];
