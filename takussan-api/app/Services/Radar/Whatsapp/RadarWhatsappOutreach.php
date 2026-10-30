<?php

namespace App\Services\Radar\Whatsapp;

use App\Models\Enums\RadarOutreachChannel;
use App\Models\RadarAdvertiser;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Radar\RadarOutreachWorkflow;
use Illuminate\Support\Facades\Log;
use Throwable;

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
 * - **Une écriture qui échoue APRÈS l'envoi** (base, verrou) ne laisse pas le message « préparé » : il est marqué envoyé,
 *   ambigu, avec l'identifiant de Meta, journalisé avant toute écriture (ADR-0081).
 * - **Le journal nomme le message, l'identifiant de Meta et le motif, jamais le texte ni le numéro.**
 * - **Chaque envoi porte un jeton opaque aléatoire** (`biz_opaque_callback_data`, TCK-2436), gardé sur la ligne avec les
 *   colonnes du canal, reprise comprise : Meta le rend dans ses accusés, et {@see RadarWhatsappReceipts} apparie par lui,
 *   exactement, un envoi resté ambigu sans identifiant. Aucune donnée personnelle, et jamais journalisé.
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

        /** @var array<string, mixed>|null $accepted les colonnes du canal, dès que Meta a accepté (ou a pu remettre) le message */
        $accepted = null;
        try {
            return $this->workflow->markSent($outreach, $by, function (RadarOutreach $locked, RadarAdvertiser $advertiser) use (&$accepted): array {
                // Un annonceur purgé n'a plus de numéro ; il a aussi dit STOP, que `markSent` refuse déjà.
                abort_code_if($advertiser->phone === null, 422, 'radar.advertiser.do_not_contact');
                $token = bin2hex(random_bytes(20));
                $result = $this->driver->sendTemplate($advertiser->phone, $this->template->for($locked), $token);

                if ($result->isTerminalSuccess()) {
                    // Journalisé AVANT les écritures : si elles échouent, il reste la trace de ce que l'annonceur a reçu.
                    Log::info('[radar.whatsapp] message accepté par Meta', ['outreach_id' => $locked->id, 'provider_message_id' => $result->providerMessageId]);

                    return $accepted = ['channel' => RadarOutreachChannel::WhatsappCloud, 'provider_message_id' => $result->providerMessageId, 'provider_status' => self::STATUS_ACCEPTED, 'provider_callback_token' => $token];
                }
                if ($result->ambiguous) {
                    Log::warning('[radar.whatsapp] envoi ambigu, marqué envoyé', ['outreach_id' => $locked->id, 'reason' => $result->failureReason]);

                    return $accepted = ['channel' => RadarOutreachChannel::WhatsappCloud, 'provider_message_id' => null, 'provider_status' => self::STATUS_AMBIGUOUS, 'provider_callback_token' => $token];
                }

                Log::warning('[radar.whatsapp] envoi refusé', ['outreach_id' => $locked->id, 'reason' => $result->failureReason]);
                abort_code(502, 'radar.whatsapp.send_failed', ['reason' => $result->failureReason]);
            });
        } catch (Throwable $error) {
            if ($accepted === null) {
                throw $error;
            }
            // Meta a le message, mais une écriture a défait la transaction : sans ceci, le message resterait « préparé »
            // et un second clic l'enverrait de nouveau. Il est marqué envoyé, ambigu, avec l'identifiant de Meta s'il y
            // en a un — sans rappeler Meta. Si cette écriture échoue à son tour, l'erreur remonte et le journal reste.
            Log::error('[radar.whatsapp] écriture défaite après l\'envoi, marqué envoyé et ambigu', [
                'outreach_id' => $outreach->id,
                'provider_message_id' => $accepted['provider_message_id'],
                'error' => class_basename($error),
            ]);
            $columns = ['provider_status' => self::STATUS_AMBIGUOUS] + $accepted;

            return $this->workflow->markSent($outreach, $by, fn (): array => $columns);
        }
    }
}
