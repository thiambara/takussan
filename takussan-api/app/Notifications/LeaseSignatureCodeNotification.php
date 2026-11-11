<?php

namespace App\Notifications;

use App\Notifications\Channels\SmsChannel;
use App\Notifications\Concerns\SupportsSms;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-596 §4B (ADR-0042 §2) — le code qui vaut signature d'un bail. SMS sur un numéro vérifié,
 * sinon e-mail ; jamais les deux. Sans lien : un code de consentement ne s'accorde pas d'un clic.
 *
 * Le SMS passe par {@see SmsChannel}, qui refuse un numéro non vérifié et borne à 5 SMS par heure
 * et par utilisateur, code critique compris.
 *
 * TCK-2646 (ADR-0098 §4) — la même classe porte le code de la signature d'un état des lieux sur
 * place : mêmes garanties (critique, synchrone, `smsLeft()`, délai de renvoi levé sur un échec), seul
 * le texte change ({@see self::TEXTS_INVENTORY}). Une seconde classe aurait dû entrer, à part, dans
 * chacune des listes fermées qui gardent celle-ci (hors préférences, synchrone, compte non joignable).
 */
class LeaseSignatureCodeNotification extends Notification implements SupportsSms
{
    use Queueable;

    public const CHANNEL_SMS = 'sms';

    public const CHANNEL_MAIL = 'mail';

    /** Le groupe de `lang/{fr,en,wo}/notifications.php` du code d'un bail (ADR-0042). */
    public const TEXTS_LEASE = 'lease_signature_code';

    /** TCK-2646 — celui d'un état des lieux signé sur place, SMS seulement (ADR-0098 §3). */
    public const TEXTS_INVENTORY = 'inventory_signature_code';

    /**
     * TCK-799 (P11.05) — ce que le canal SMS a rendu, posé par {@see afterSending()}. Un objet, et
     * non un booléen : Laravel envoie une COPIE de la notification à chaque canal (`clone`), et
     * seule une référence partagée revient à l'appelant.
     *
     * @var \ArrayObject<string, bool>
     */
    private readonly \ArrayObject $outcome;

    public function __construct(
        public readonly string $code,
        public readonly string $reference,
        public readonly int $expiresInMinutes,
        public readonly string $channel,
        // P72.04 (TCK-1354) — le délai de renvoi du signataire, levé par un accusé `failed`.
        public readonly ?string $resendKey = null,
        // TCK-2646 — le texte : bail, ou état des lieux signé sur place.
        public readonly string $texts = self::TEXTS_LEASE,
    ) {
        $this->outcome = new \ArrayObject;
    }

    /**
     * `true` si le code est parti (ou a pu partir), `false` s'il n'est sûrement pas parti, `null`
     * si aucun canal SMS n'a répondu (e-mail, ou faux `Notification` des tests).
     */
    public function smsLeft(): ?bool
    {
        return $this->outcome['sms_left'] ?? null;
    }

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return [$this->channel === self::CHANNEL_SMS ? SmsChannel::class : 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('notifications.'.$this->texts.'.subject', ['reference' => $this->reference]))
            ->greeting(__('notifications.'.$this->texts.'.greeting'))
            ->line(__('notifications.'.$this->texts.'.intro', ['reference' => $this->reference]))
            ->line('**'.$this->code.'**')
            ->line(__('notifications.'.$this->texts.'.expires', ['minutes' => $this->expiresInMinutes]))
            ->line(__('notifications.'.$this->texts.'.ignore'))
            ->salutation(__('notifications.salutation'));
    }

    public function toSms(object $notifiable): string
    {
        return __('notifications.'.$this->texts.'.sms', [
            'code' => $this->code,
            'reference' => $this->reference,
            'minutes' => $this->expiresInMinutes,
        ]);
    }

    public function shouldSendSms(): bool
    {
        return $this->channel === self::CHANNEL_SMS;
    }

    public function isCriticalSms(): bool
    {
        return true;
    }

    /**
     * Rappel de Laravel après chaque canal. {@see SmsChannel} rend `null` quand il refuse (borne
     * horaire, numéro invalide), sinon un résultat par numéro : le code est parti si l'un d'eux est
     * envoyé, différé, ou en échec ambigu (le fournisseur a pu l'accepter).
     */
    public function afterSending(object $notifiable, string $channel, mixed $response): void
    {
        if ($channel !== SmsChannel::class) {
            return;
        }
        $left = false;
        foreach (is_array($response) ? $response : [] as $result) {
            if ($result instanceof SmsResult && ($result->status !== SmsResult::STATUS_FAILED || $result->ambiguous)) {
                $left = true;
            }
        }
        $this->outcome['sms_left'] = $left;
    }

    /** TCK-766 — le code de signature doit arriver : il garde le repli sur un échec ambigu. */
    public function isOtpSms(): bool
    {
        return true;
    }

    /** P72.04 (TCK-1354) — lu par `SmsChannel`, passé au routeur en `otp_resend_key`. */
    public function otpResendKey(): ?string
    {
        return $this->resendKey;
    }
}
