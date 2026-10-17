<?php

namespace App\Notifications;

use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\User;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-088 — Sent to the tenant when their lease deposit has been refunded.
 * Channel selection respects each user's preferences via PreferenceResolver.
 *
 * Refund attachments (photos, repair invoices) are exposed as signed API
 * URLs on the in-app payload and as inline links in the mail body so the
 * tenant can review the retention justification without logging in.
 *
 * TCK-539 — ces URL étaient l'URL DIRECTE du fichier (`getFullUrl()`), adressable
 * par quiconque devinait l'identifiant. Elles sont désormais signées, et valent
 * {@see self::ATTACHMENT_LINK_TTL_DAYS} jours : un courriel se lit plus tard
 * qu'une page, mais un lien vers une pièce privée ne doit pas être éternel.
 *
 * TCK-821 (P23.05) — l'URL de 7 jours ne vit plus que dans le courriel. `toArray()`, que le canal
 * `database` range dans `app_notifications.data` et que la cloche relit, ne porte que
 * l'identifiant et le nom de chaque pièce : un lien qui ouvre sans session n'est plus conservé en
 * base ni relu sept jours durant. La cloche le signe à la lecture, après l'autorisation du bail
 * ({@see self::attachmentsAtRead()}), pour la durée courte de `PrivateMediaAccess`.
 */
class LeaseDepositRefundNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'lease_deposit_refunded';

    public const ATTACHMENT_LINK_TTL_DAYS = 7;

    public function __construct(
        public Lease $lease,
        public float $refunded,
        public float $retained,
        public string $reason,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);
        $channels = [];

        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_INAPP)) {
            $channels[] = 'database';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_PUSH)) {
            $channels[] = 'broadcast';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $reference = $this->lease->reference_number ?? '#'.$this->lease->id;

        $message = (new MailMessage)
            ->subject(__('notifications.lease_deposit_refunded.subject', ['reference' => $reference]))
            ->greeting(__('notifications.lease_deposit_refunded.greeting'))
            ->line(__('notifications.lease_deposit_refunded.intro', [
                'reference' => $reference,
                'amount' => app(CurrencyFormatter::class)->format($this->refunded, $this->lease->currency ?? Currency::XOF, app()->getLocale()),
            ]));

        if ($this->retained > 0) {
            $message->line(__('notifications.lease_deposit_refunded.retention', [
                'amount' => app(CurrencyFormatter::class)->format($this->retained, $this->lease->currency ?? Currency::XOF, app()->getLocale()),
                'reason' => $this->reason !== '' ? $this->reason : '—',
            ]));
        }

        foreach ($this->attachments() as $attachment) {
            $message->line('• '.$attachment['name'].' — '.$attachment['url']);
        }

        return $message->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'lease_id' => $this->lease->id,
            'lease_reference' => $this->lease->reference_number,
            'refunded' => $this->refunded,
            'retained' => $this->retained,
            'reason' => $this->reason !== '' ? $this->reason : null,
            'currency' => $this->lease->currency?->value,
            'attachments' => array_map(
                fn (array $a): array => ['id' => $a['id'], 'name' => $a['name']],
                $this->attachments(signed: false),
            ),
            'title' => __('notifications.lease_deposit_refunded.subject', [
                'reference' => $this->lease->reference_number ?? '#'.$this->lease->id,
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'lease.deposit_refunded';
    }

    /**
     * TCK-821 (P23.05) — les pièces rangées dans `data`, signées pour ce lecteur : une URL courte
     * pour chaque pièce de la collection du bail, si le lecteur peut voir ce bail ; `null` sinon,
     * ou pour une pièce qui n'appartient pas à ce bail.
     *
     * @param  array<string,mixed>  $data
     * @return list<array{id:int,name:string,url:?string}>
     */
    public static function attachmentsAtRead(array $data, ?User $reader): array
    {
        $stored = is_array($data['attachments'] ?? null) ? $data['attachments'] : [];
        if ($stored === []) {
            return [];
        }

        $lease = is_numeric($data['lease_id'] ?? null) ? Lease::query()->find((int) $data['lease_id']) : null;
        $readable = $lease !== null && $reader !== null && $reader->can('view', $lease);
        $media = $readable ? $lease->getMedia('lease_deposit_refund')->keyBy('id') : collect();
        $access = app(PrivateMediaAccess::class);

        return array_values(array_map(function (mixed $a) use ($media, $access): array {
            $id = (int) data_get($a, 'id');
            $file = $media->get($id);

            return [
                'id' => $id,
                'name' => (string) data_get($a, 'name', ''),
                'url' => $file !== null ? $access->signedUrl($file) : null,
            ];
        }, $stored));
    }

    /**
     * @return list<array{id:int,name:string,url?:string}>
     */
    protected function attachments(bool $signed = true): array
    {
        return $this->lease->getMedia('lease_deposit_refund')
            ->map(fn ($media) => [
                'id' => $media->id,
                'name' => $media->name,
                ...($signed ? ['url' => app(PrivateMediaAccess::class)->signedUrl(
                    $media,
                    now()->addDays(self::ATTACHMENT_LINK_TTL_DAYS),
                )] : []),
            ])
            ->values()
            ->all();
    }
}
