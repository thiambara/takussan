<?php

namespace App\Notifications\Payouts;

use App\Models\Enums\NotificationType;
use App\Notifications\Channels\AppDatabaseChannel;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-594 (ADR-0039) — les avis des sorties d'argent : en base et par e-mail.
 *
 * Aucun littéral : l'objet, chaque ligne et le titre de l'avis en base sont des clés
 * `money_out.notifications.<code>.*`, et la charge porte le CODE et les données — le front possède le
 * texte affiché (principe n° 5). WhatsApp et SMS viendront par les canaux de TCK-588.
 */
abstract class MoneyOutNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /** Le code de l'avis : `money_out.notifications.<code>.*`, et l'`event_type` des préférences. */
    abstract protected function code(): string;

    /** @return array<string, mixed> les paramètres des clés, et la charge de l'avis en base */
    abstract protected function data(): array;

    /** @return list<string> les clés des lignes du courriel, sous `money_out.notifications.<code>.` */
    protected function lines(): array
    {
        return ['intro'];
    }

    /** Un avis de sécurité part par e-mail quelles que soient les préférences. */
    protected function critical(): bool
    {
        return false;
    }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        $channels = ['database'];

        if ($this->critical()
            || app(PreferenceResolver::class)->shouldSend($notifiable, 'money_out_'.$this->code(), PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $params = $this->params();
        $message = (new MailMessage)
            ->subject(__($this->key('subject'), $params))
            ->greeting(__('money_out.notifications.greeting'));

        foreach ($this->lines() as $line) {
            $message->line(__($this->key($line), $params));
        }

        return $message->salutation(__('money_out.notifications.salutation'));
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return array_merge($this->data(), [
            'code' => 'money_out.'.$this->code(),
            'title' => __($this->key('subject'), $this->params()),
        ]);
    }

    /**
     * Le pont vers `app_notifications` ({@see AppDatabaseChannel}) :
     * déclaré ici plutôt qu'inscrit dans sa carte `TYPES`, que d'autres branches modifient.
     *
     * @return array<string, mixed>
     */
    public function toAppNotification(object $notifiable): array
    {
        $data = $this->toArray($notifiable);

        return [
            'type' => NotificationType::Payment,
            'title' => $data['title'],
            'data' => $data,
            'referenceable_type' => $this->referenceable()?->getMorphClass(),
            'referenceable_id' => $this->referenceable()?->getKey(),
        ];
    }

    /** L'objet que l'avis désigne, s'il en a un. */
    protected function referenceable(): ?Model
    {
        return property_exists($this, 'payout') ? $this->payout : null;
    }

    protected function key(string $suffix): string
    {
        return 'money_out.notifications.'.$this->code().'.'.$suffix;
    }

    /** @return array<string, string> les paramètres en chaînes, un montant XOF sans décimale */
    protected function params(): array
    {
        $params = [];
        foreach ($this->data() as $name => $value) {
            if (is_scalar($value) || $value === null) {
                $params[$name] = (string) ($value ?? '');
            }
        }

        return $params;
    }

    protected function amount(mixed $value, ?string $currency): string
    {
        $places = in_array($currency, ['XOF', 'XAF', null], true) ? 0 : 2;

        return number_format((float) $value, $places, ',', ' ');
    }
}
