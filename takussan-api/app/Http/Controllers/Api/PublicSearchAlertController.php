<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ConfirmPublicSearchAlertRequest;
use App\Http\Requests\Api\StorePublicSearchAlertRequest;
use App\Http\Requests\Api\UnsubscribePublicSearchAlertRequest;
use App\Jobs\RecordPublicSearchAlert;
use App\Models\AlertSubscriber;
use App\Models\WhatsappContact;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Notifications\Sms\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * TCK-599 (ADR-0050 §4) — les alertes de recherche sans compte.
 *
 * Trois règles tiennent toute la surface :
 *
 * 1. **Rien ne part avant la double confirmation**, sauf l'unique message qui la demande — et le
 *    job ne sert qu'un abonné `confirmed_at` non nul.
 * 2. **Aucune énumération** : la création répond 202 avec le MÊME corps, et après le MÊME
 *    travail, que le contact soit connu ou non, qu'une borne soit atteinte ou non — tout ce qui
 *    dépend du contact se fait dans {@see RecordPublicSearchAlert}. Une borne atteinte se tait,
 *    elle ne refuse pas.
 * 3. **Aucun contact dans une réponse ni un journal** : le contact est chiffré en base, retrouvé
 *    par son empreinte.
 */
class PublicSearchAlertController extends Controller
{
    public function __construct(private readonly PhoneVerificationService $codes) {}

    public function capabilities(): JsonResponse
    {
        return $this->json(['data' => [
            'channels' => config('search_alerts.whatsapp_enabled')
                ? AlertSubscriber::CHANNELS
                : [AlertSubscriber::CHANNEL_EMAIL],
        ]]);
    }

    /**
     * Le même travail que le contact soit connu ou non : valider, normaliser, pousser. Compter,
     * écrire et envoyer se font dans {@see RecordPublicSearchAlert}, hors du temps de la réponse.
     */
    public function store(StorePublicSearchAlertRequest $request): JsonResponse
    {
        $data = $request->validated();
        $channel = (string) $data['channel'];

        RecordPublicSearchAlert::dispatch(
            Arr::only($data, ['criteria', 'frequency', 'locale', 'name']),
            $channel,
            AlertSubscriber::normalizeContact($channel, $request->contact()),
        );

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
            if (! $this->codes->hasCodeFor(RecordPublicSearchAlert::SCOPE.$subscriber->id, $phone)) {
                continue;
            }
            if (! $this->codes->verifyCodeFor(RecordPublicSearchAlert::SCOPE.$subscriber->id, $phone, $code)) {
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
