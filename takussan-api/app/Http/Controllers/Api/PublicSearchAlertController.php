<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ConfirmPublicSearchAlertRequest;
use App\Http\Requests\Api\StorePublicSearchAlertRequest;
use App\Http\Requests\Api\UnsubscribePublicSearchAlertRequest;
use App\Models\AlertSubscriber;
use App\Models\SavedSearch;
use App\Models\WhatsappContact;
use App\Notifications\SearchAlertConfirmationNotification;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Notifications\Sms\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * TCK-599 (ADR-0050 §4) — les alertes de recherche sans compte.
 *
 * Trois règles tiennent toute la surface :
 *
 * 1. **Rien ne part avant la double confirmation**, sauf l'unique message qui la demande — et le
 *    job ne sert qu'un abonné `confirmed_at` non nul.
 * 2. **Aucune énumération** : la création répond 202 avec le MÊME corps, que le contact soit
 *    connu ou non, qu'une borne soit atteinte ou non. Une borne atteinte se tait, elle ne refuse
 *    pas.
 * 3. **Aucun contact dans une réponse ni un journal** : le contact est chiffré en base, retrouvé
 *    par son empreinte.
 */
class PublicSearchAlertController extends Controller
{
    private const SCOPE = 'search_alert:';

    public function __construct(private readonly PhoneVerificationService $codes) {}

    public function capabilities(): JsonResponse
    {
        return $this->json(['data' => [
            'channels' => config('search_alerts.whatsapp_enabled')
                ? AlertSubscriber::CHANNELS
                : [AlertSubscriber::CHANNEL_EMAIL],
        ]]);
    }

    public function store(StorePublicSearchAlertRequest $request): JsonResponse
    {
        $data = $request->validated();
        $channel = (string) $data['channel'];
        $contact = AlertSubscriber::normalizeContact($channel, $request->contact());
        $hash = AlertSubscriber::contactHash($channel, $contact);

        $open = AlertSubscriber::query()->where('contact_hash', $hash)->count();
        if ($open < (int) config('search_alerts.max_open_per_contact', 5)) {
            $this->createAndConfirm($data, $channel, $contact, $hash);
        }

        return $this->accepted();
    }

    public function confirm(ConfirmPublicSearchAlertRequest $request): JsonResponse
    {
        $subscriber = $request->filled('token')
            ? $this->confirmByToken((string) $request->validated('token'))
            : $this->confirmByCode((string) $request->validated('phone'), (string) $request->validated('code'));

        if ($subscriber === null) {
            abort_code(422, $request->filled('token') ? 'search_alert.invalid_token' : 'search_alert.invalid_code');
        }

        return $this->json(['data' => ['status' => 'confirmed']]);
    }

    /** Idempotent : un jeton inconnu ou déjà servi rend la même réponse. */
    public function unsubscribe(UnsubscribePublicSearchAlertRequest $request): JsonResponse
    {
        AlertSubscriber::query()
            ->where('unsubscribe_token_hash', AlertSubscriber::tokenHash((string) $request->validated('token')))
            ->first()
            ?->eraseContact();

        return $this->json(['data' => ['status' => 'unsubscribed']]);
    }

    private function accepted(): JsonResponse
    {
        return $this->json(['data' => ['status' => 'pending_confirmation']], 202);
    }

    /** @param  array<string, mixed>  $data */
    private function createAndConfirm(array $data, string $channel, string $contact, string $hash): void
    {
        $token = $channel === AlertSubscriber::CHANNEL_EMAIL ? AlertSubscriber::newToken() : null;
        $unsubscribe = AlertSubscriber::newToken();

        $subscriber = DB::transaction(function () use ($data, $channel, $contact, $hash, $token, $unsubscribe): AlertSubscriber {
            $subscriber = AlertSubscriber::create([
                'channel' => $channel,
                'contact' => $contact,
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

        $delivered = $channel === AlertSubscriber::CHANNEL_EMAIL
            ? $this->sendConfirmationMail($subscriber, (string) $token)
            : $this->codes->sendCodeTo(self::SCOPE.$subscriber->id, $contact, $subscriber->locale);

        if ($delivered) {
            $subscriber->forceFill(['confirmation_sent_at' => now()])->save();
        }
    }

    private function sendConfirmationMail(AlertSubscriber $subscriber, string $token): bool
    {
        $subscriber->notify(new SearchAlertConfirmationNotification(
            $token,
            (string) $subscriber->savedSearches()->value('name'),
        ));

        return true;
    }

    private function confirmByToken(string $token): ?AlertSubscriber
    {
        $subscriber = AlertSubscriber::query()
            ->where('confirmation_token_hash', AlertSubscriber::tokenHash($token))
            ->whereNull('confirmed_at')
            ->where('created_at', '>', now()->subHours((int) config('search_alerts.confirmation_ttl_hours', 48)))
            ->first();

        // Usage unique : l'empreinte disparaît avec la confirmation.
        $subscriber?->forceFill(['confirmed_at' => now(), 'confirmation_token_hash' => null])->save();

        return $subscriber;
    }

    private function confirmByCode(string $phone, string $code): ?AlertSubscriber
    {
        try {
            $phone = PhoneNumber::normalize($phone);
        } catch (InvalidArgumentException) {
            return null;
        }

        $pending = AlertSubscriber::query()
            ->forContact(AlertSubscriber::CHANNEL_WHATSAPP, $phone)
            ->whereNull('confirmed_at')
            ->where('created_at', '>', now()->subHours((int) config('search_alerts.confirmation_ttl_hours', 48)))
            ->latest('id')
            ->get();

        foreach ($pending as $subscriber) {
            // Un code n'est éprouvé que contre la demande qui l'a reçu : sans code en cours, une
            // saisie ne compte contre aucune (TCK-589, vérification adverse M1).
            if (! $this->codes->hasCodeFor(self::SCOPE.$subscriber->id, $phone)) {
                continue;
            }
            if (! $this->codes->verifyCodeFor(self::SCOPE.$subscriber->id, $phone, $code)) {
                return null;
            }

            DB::transaction(function () use ($subscriber, $phone): void {
                $subscriber->forceFill(['confirmed_at' => now()])->save();
                // La garde d'opt-in de `WhatsappChannel` (TCK-588) sert un destinataire sans compte
                // seulement s'il y a consenti : la confirmation EST ce consentement.
                WhatsappContact::query()->firstOrCreate(['phone' => $phone])->optIn('search_alert');
            });

            return $subscriber;
        }

        return null;
    }
}
