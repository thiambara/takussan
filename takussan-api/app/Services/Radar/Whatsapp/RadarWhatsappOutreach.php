<?php

namespace App\Services\Radar\Whatsapp;

use App\Models\Enums\RadarOutreachChannel;
use App\Models\RadarAdvertiser;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Radar\RadarOutreachWorkflow;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2395 (ADR-0077 §5) — envoyer un message d'accord préparé par l'API, depuis le numéro du Radar : le geste
 * « J'ai envoyé » ({@see RadarOutreachWorkflow::markSent()}), mêmes règles et mêmes verrous, dont l'envoi est fait par
 * le code au lieu de l'opérateur.
 *
 * - **Le numéro est jugé deux fois** : avant les verrous (échouer tôt), puis par le pilote lui-même, juste avant l'appel.
 * - **Un refus franc de Meta n'écrit rien** : 502 `radar.whatsapp.send_failed`, le message reste préparé.
 * - **Un échec ambigu (délai dépassé, 5xx) marque le message envoyé**, sans identifiant (`provider_status = ambiguous`) :
 *   Meta a pu le remettre, et écrire deux fois au même annonceur expose le numéro aux signalements « spam » qui le
 *   bloquent. Sans réponse, la file des relances le reprend comme tout message envoyé.
 * - **Le journal nomme le message et le motif, jamais le texte ni le numéro.**
 */
final class RadarWhatsappOutreach
{
    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_AMBIGUOUS = 'ambiguous';

    public function __construct(
        private readonly RadarOutreachWorkflow $workflow,
        private readonly RadarWhatsappDriver $driver,
        private readonly RadarWhatsappNumber $number,
        private readonly RadarWhatsappTemplate $template,
    ) {}

    public function send(RadarOutreach $outreach, User $by): RadarOutreach
    {
        $this->number->assertUsable();

        return $this->workflow->markSent($outreach, $by, function (RadarOutreach $locked, RadarAdvertiser $advertiser): array {
            // Un annonceur purgé n'a plus de numéro ; il a aussi dit STOP, que `markSent` refuse déjà.
            abort_code_if($advertiser->phone === null, 422, 'radar.advertiser.do_not_contact');
            $result = $this->driver->sendTemplate($advertiser->phone, $this->template->for($locked));

            if ($result->isTerminalSuccess()) {
                return ['channel' => RadarOutreachChannel::WhatsappCloud, 'provider_message_id' => $result->providerMessageId, 'provider_status' => self::STATUS_ACCEPTED];
            }
            if ($result->ambiguous) {
                Log::warning('[radar.whatsapp] envoi ambigu, marqué envoyé', ['outreach_id' => $locked->id, 'reason' => $result->failureReason]);

                return ['channel' => RadarOutreachChannel::WhatsappCloud, 'provider_message_id' => null, 'provider_status' => self::STATUS_AMBIGUOUS];
            }

            Log::warning('[radar.whatsapp] envoi refusé', ['outreach_id' => $locked->id, 'reason' => $result->failureReason]);
            abort_code(502, 'radar.whatsapp.send_failed', ['reason' => $result->failureReason]);
        });
    }
}
