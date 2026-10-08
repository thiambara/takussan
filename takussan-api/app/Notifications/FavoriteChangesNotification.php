<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\Currency;
use App\Models\Enums\NotificationType;
use App\Models\Favorite;
use App\Models\User;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Notifications\PreferenceResolver;
use App\Support\MarkdownText;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-599 §5 — UNE notification par personne et par genre : les baisses de prix de ses favoris
 * (`favorite_price_drop`), ou leurs sorties du public (`favorite_unavailable`). Deux interrupteurs
 * distincts : couper l'un ne coupe pas l'autre.
 *
 * ⚠ Une sortie du public ne porte JAMAIS de prix (contrainte 3, AC21) : sa ligne ne reçoit que le
 * titre et la raison, et un bien supprimé pas même son titre.
 */
class FavoriteChangesNotification extends Notification
{
    use Queueable;

    public const KIND_PRICE_DROP = 'price_drop';

    public const KIND_UNAVAILABLE = 'unavailable';

    /** @var array<string, string> genre → événement de préférence */
    public const EVENTS = [
        self::KIND_PRICE_DROP => 'favorite_price_drop',
        self::KIND_UNAVAILABLE => 'favorite_unavailable',
    ];

    /**
     * @param  list<array{property_id: int, title: string, old?: string, new?: string, currency?: ?Currency, availability?: string}>  $items
     */
    public function __construct(
        public readonly string $kind,
        public readonly array $items,
    ) {}

    public function eventType(): string
    {
        return self::EVENTS[$this->kind];
    }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        if (! $notifiable instanceof User) {
            return [];
        }
        $channels = ['database'];
        if (app(PreferenceResolver::class)->shouldSend($notifiable, $this->eventType(), PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject(__("favorite_alerts.{$this->kind}.title"))
            ->greeting(__('favorite_alerts.mail.greeting'))
            ->line($this->body());

        foreach ($this->lines() as $line) {
            $mail->line($line);
        }

        return $mail
            ->action(__('favorite_alerts.mail.action'), rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/').'/app/favorites')
            ->salutation(__('notifications.salutation'));
    }

    /** @return array<string, mixed> */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __("favorite_alerts.{$this->kind}.title"),
            'body' => $this->body(),
            'data' => $this->toArray($notifiable),
            'target' => NotificationTarget::of('favorites')->toArray(),
        ];
    }

    /** @return array{property_ids: list<int>, kind: string} */
    public function toArray(object $notifiable): array
    {
        return [
            'property_ids' => array_map(fn (array $item) => (int) $item['property_id'], $this->items),
            'kind' => $this->kind,
        ];
    }

    private function body(): string
    {
        $count = count($this->items);

        return trans_choice("favorite_alerts.{$this->kind}.body", $count, ['count' => $count]);
    }

    /**
     * Les lignes de l'e-mail. Un titre est une saisie de l'agence : il reste du texte dans le
     * Markdown (verif-599 B1, observation 4).
     *
     * @return list<string>
     */
    private function lines(): array
    {
        $locale = app()->getLocale();
        $formatter = app(CurrencyFormatter::class);

        return array_map(function (array $item) use ($locale, $formatter): string {
            $item['title'] = MarkdownText::escape($item['title']);
            if ($this->kind === self::KIND_PRICE_DROP) {
                $currency = $item['currency'] ?? Currency::XOF;

                return __('favorite_alerts.price_drop.line', [
                    'title' => $item['title'],
                    'old' => $formatter->format(Favorite::cents($item['old']) / 100, $currency, $locale),
                    'new' => $formatter->format(Favorite::cents($item['new']) / 100, $currency, $locale),
                ]);
            }

            return match ($item['availability'] ?? Favorite::UNAVAILABLE) {
                Favorite::RENTED => __('favorite_alerts.unavailable.line_rented', ['title' => $item['title']]),
                Favorite::SOLD => __('favorite_alerts.unavailable.line_sold', ['title' => $item['title']]),
                Favorite::REMOVED => __('favorite_alerts.unavailable.line_removed'),
                default => __('favorite_alerts.unavailable.line_unavailable', ['title' => $item['title']]),
            };
        }, $this->items);
    }
}
