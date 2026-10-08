<?php

namespace App\Jobs;

use App\Models\AlertSubscriber;
use App\Models\SavedSearch;
use App\Notifications\SearchAlertConfirmationNotification;
use App\Services\Auth\PhoneVerificationService;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-599 (ADR-0050 §4, décision 13) — la demande d'alerte d'un visiteur, traitée HORS de la
 * requête.
 *
 * La réponse 202 est la même que le contact soit connu ou non ; il faut aussi que son TEMPS le
 * soit. Tant que la requête comptait les demandes du contact, écrivait l'abonné et envoyait la
 * confirmation, une borne atteinte (rien à faire) répondait plus vite qu'un contact neuf (un
 * e-mail synchrone) : le chronomètre disait ce que le corps taisait. La requête ne fait plus que
 * valider et pousser ce job — le même travail dans tous les cas.
 *
 * Chiffré (`ShouldBeEncrypted`) : la charge porte le contact en clair, et la table `jobs` le
 * garderait lisible jusqu'au passage du worker. Un échec est journalisé sans contact ni message,
 * et n'est pas rejoué : la demande reste en attente et la purge l'efface à 48 h.
 */
class RecordPublicSearchAlert implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    /** La portée des codes WhatsApp d'une demande — relue par la confirmation. */
    public const SCOPE = 'search_alert:';

    public int $tries = 1;

    /**
     * @param  array<string, mixed>  $data  la demande validée (`criteria`, `frequency`, `locale`, `name`)
     */
    public function __construct(
        public readonly array $data,
        public readonly string $channel,
        public readonly string $contact,
    ) {}

    public function handle(PhoneVerificationService $codes): void
    {
        try {
            $hash = AlertSubscriber::contactHash($this->channel, $this->contact);

            $open = AlertSubscriber::query()->where('contact_hash', $hash)->count();
            if ($open < (int) config('search_alerts.max_open_per_contact', 5)) {
                $this->createAndConfirm($codes, $hash);
            }
        } catch (Throwable $e) {
            Log::error('search_alert.request_failed', ['channel' => $this->channel]
                + SafeExceptionContext::of($e));
        }
    }

    private function createAndConfirm(PhoneVerificationService $codes, string $hash): void
    {
        $data = $this->data;
        $token = $this->channel === AlertSubscriber::CHANNEL_EMAIL ? AlertSubscriber::newToken() : null;
        $unsubscribe = AlertSubscriber::newToken();

        $subscriber = DB::transaction(function () use ($data, $hash, $token, $unsubscribe): AlertSubscriber {
            $subscriber = AlertSubscriber::create([
                'channel' => $this->channel,
                'contact' => $this->contact,
                'contact_hash' => $hash,
                'locale' => $data['locale'],
                'confirmation_token_hash' => $token !== null ? AlertSubscriber::tokenHash($token) : null,
                'unsubscribe_token' => $unsubscribe,
                'unsubscribe_token_hash' => AlertSubscriber::tokenHash($unsubscribe),
                'consent_at' => now(),
                'consent_source' => 'public_search_alert',
                'consent_version' => AlertSubscriber::CONSENT_VERSION,
            ]);
            SavedSearch::create([
                'alert_subscriber_id' => $subscriber->id,
                'name' => (string) ($data['name'] ?? '') !== '' ? $data['name'] : __('saved_search_alerts.default_name', [], $data['locale']),
                'criteria' => $data['criteria'],
                'notification_frequency' => $data['frequency'],
                'is_active' => true,
            ]);

            return $subscriber;
        });

        // Au plus N messages de confirmation au même contact sur 24 h : au-delà, la demande
        // reste en attente, muette, et la purge l'efface à 48 h.
        $sent = AlertSubscriber::query()
            ->where('contact_hash', $hash)
            ->where('confirmation_sent_at', '>=', now()->subDay())
            ->count();
        if ($sent >= (int) config('search_alerts.max_confirmations_per_day', 2)) {
            return;
        }

        if ($token !== null) {
            $subscriber->notify(new SearchAlertConfirmationNotification($token));
            $delivered = true;
        } else {
            $delivered = $codes->sendCodeTo(self::SCOPE.$subscriber->id, $this->contact, $subscriber->locale);
        }

        if ($delivered) {
            $subscriber->forceFill(['confirmation_sent_at' => now()])->save();
        }
    }
}
