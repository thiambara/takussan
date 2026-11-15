<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ConfirmPublicSearchAlertRequest;
use App\Http\Requests\Api\ShowPublicSearchAlertByTokenRequest;
use App\Http\Requests\Api\StorePublicSearchAlertRequest;
use App\Http\Requests\Api\UnsubscribePublicSearchAlertRequest;
use App\Http\Requests\Api\UpdatePublicSearchAlertFrequencyRequest;
use App\Jobs\RecordPublicSearchAlert;
use App\Models\AlertSubscriber;
use App\Models\SavedSearch;
use App\Models\WhatsappContact;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Model\SearchService;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Support\Logging\SafeExceptionContext;
use App\Support\SavedSearchCriteria;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Throwable;

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
        $contact = AlertSubscriber::normalizeContact($channel, $request->contact());

        // La borne par CONTACT se compte dans le job, pas ici : un 429 propre au contact, et son
        // `Retry-After`, disaient qu'on avait visé cette boîte dans l'heure (verif-599 m2). Une
        // borne atteinte se tait, comme les autres.
        RecordPublicSearchAlert::dispatch(
            Arr::only($data, ['criteria', 'frequency', 'locale', 'name']),
            $channel,
            $contact,
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

    /**
     * TCK-2513 — l'alerte à laquelle répond un lien : un jeton de CONFIRMATION encore valide (mêmes conditions que
     * {@see self::confirmByToken()}), ou un jeton de DÉSINSCRIPTION. Une lecture ne consomme rien et ne confirme
     * rien : un analyseur de liens qui suit l'URL de la page n'agit sur personne.
     *
     * Tout jeton qui ne sert pas — inconnu, expiré, déjà consommé, abonné effacé — rend le MÊME 404, après les MÊMES
     * deux requêtes : un jeton consommé a perdu son empreinte, il se cherche et se manque exactement comme un faux.
     * Aucun contact ne sort (ADR-0050 §4) ; les critères sont filtrés au vocabulaire fermé.
     */
    public function byToken(ShowPublicSearchAlertByTokenRequest $request, SearchService $searchService): JsonResponse
    {
        $hash = AlertSubscriber::tokenHash((string) $request->validated('token'));

        $kind = 'confirm';
        $subscriber = $this->pendingConfirmation($hash)->first();
        if ($subscriber === null) {
            $kind = 'unsubscribe';
            $subscriber = AlertSubscriber::query()->where('unsubscribe_token_hash', $hash)->first();
        }

        $search = $subscriber?->savedSearches()->orderBy('id')->first();
        abort_if($search === null, 404);

        return $this->json(['data' => [
            'kind' => $kind,
            'name' => $search->name,
            'criteria' => array_intersect_key((array) $search->criteria, array_flip(SavedSearchCriteria::KEYS)),
            'frequency' => $search->notification_frequency,
            'matches' => $this->matches($searchService, $search),
        ]]);
    }

    /**
     * TCK-2513 — espacer plutôt que couper : les recherches de CET abonné (la demande du lien) passent à `weekly`. Il
     * n'est pas désinscrit. Un jeton inconnu rend la même réponse qu'un succès, comme {@see self::unsubscribe()}.
     */
    public function frequency(UpdatePublicSearchAlertFrequencyRequest $request): JsonResponse
    {
        $frequency = (string) $request->validated('frequency');
        $subscriber = AlertSubscriber::query()
            ->where('unsubscribe_token_hash', AlertSubscriber::tokenHash((string) $request->validated('token')))
            ->first();

        if ($subscriber !== null) {
            SavedSearch::query()
                ->where('alert_subscriber_id', $subscriber->id)
                ->update(['notification_frequency' => $frequency, 'updated_at' => now()]);
        }

        return $this->json(['data' => ['status' => $frequency]]);
    }

    /**
     * Le nombre de biens publics que les critères trouvent aujourd'hui, par le moteur de l'alerte
     * ({@see SearchService::countMatchingProperties()}). Un moteur indisponible ne fait pas échouer la page : `null`.
     */
    private function matches(SearchService $searchService, SavedSearch $search): ?int
    {
        try {
            return $searchService->countMatchingProperties($search);
        } catch (Throwable $e) {
            Log::warning('search_alert.count_failed', ['saved_search_id' => $search->id]
                + Arr::except(SafeExceptionContext::of($e), ['message']));

            return null;
        }
    }

    /** @return Builder<AlertSubscriber> */
    private function pendingConfirmation(string $hash): Builder
    {
        return AlertSubscriber::query()
            ->where('confirmation_token_hash', $hash)
            ->whereNull('confirmed_at')
            ->where('created_at', '>', now()->subHours((int) config('search_alerts.confirmation_ttl_hours', 48)));
    }

    private function accepted(): JsonResponse
    {
        return $this->json(['data' => ['status' => 'pending_confirmation']], 202);
    }

    private function confirmByToken(string $token): ?AlertSubscriber
    {
        $subscriber = $this->pendingConfirmation(AlertSubscriber::tokenHash($token))->first();

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
                // Un consentement déjà donné ailleurs garde sa source : la désinscription de l'alerte
                // ne retirera que celui qu'elle a posé (verif-599 m3).
                $contact = WhatsappContact::query()->firstOrCreate(['phone' => $phone]);
                if ($contact->opt_in_status !== WhatsappContact::OPT_IN_OPTED_IN) {
                    $contact->optIn(AlertSubscriber::WHATSAPP_CONSENT_SOURCE);
                }
            });

            return $subscriber;
        }

        return null;
    }
}
