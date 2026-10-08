<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreSavedSearchRequest;
use App\Http\Requests\Api\UpdateSavedSearchRequest;
use App\Http\Resources\SavedSearchResource;
use App\Models\AlertSubscriber;
use App\Models\SavedSearch;
use App\Services\Notifications\Sms\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SavedSearchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $searches = SavedSearch::where('user_id', $request->user()->id)->latest()->get();

        return $this->json([
            'data' => SavedSearchResource::collection($searches)->toArray($request),
        ]);
    }

    public function store(StoreSavedSearchRequest $request): JsonResponse
    {
        $data = $request->validated();

        $search = SavedSearch::create(array_merge($data, [
            'user_id' => $request->user()->id,
            'is_active' => true,
        ]));

        return $this->json([
            'data' => SavedSearchResource::make($search)->toArray($request),
        ], 201);
    }

    public function update(UpdateSavedSearchRequest $request, SavedSearch $savedSearch): JsonResponse
    {

        $data = $request->validated();

        $savedSearch->fill($data)->save();

        return $this->json([
            'data' => SavedSearchResource::make($savedSearch->refresh())->toArray($request),
        ]);
    }

    /**
     * TCK-599 (ADR-0050 §4, contrainte 7) — rattache au compte les alertes sans compte de SON
     * contact, et seulement s'il est VÉRIFIÉ : l'e-mail (`email_verified_at`, repli ADR-0025) ou le
     * téléphone (`phone_verified_at`, E.164). Jamais par déclaration. Les demandes rattachées
     * quittent `alert_subscribers` : le compte porte désormais le contact.
     */
    public function claim(Request $request): JsonResponse
    {
        $user = $request->user();
        $hashes = [];
        if ($user->email && $user->email_verified_at) {
            $hashes[] = AlertSubscriber::contactHash(AlertSubscriber::CHANNEL_EMAIL, (string) $user->email);
        }
        if ($user->phone && $user->phone_verified_at && PhoneNumber::isValid(preg_replace('/\s+/', '', (string) $user->phone) ?? '')) {
            $hashes[] = AlertSubscriber::contactHash(AlertSubscriber::CHANNEL_WHATSAPP, (string) $user->phone);
        }
        if ($hashes === []) {
            return $this->json(['data' => ['claimed' => 0]]);
        }

        $claimed = DB::transaction(function () use ($user, $hashes): int {
            $subscribers = AlertSubscriber::query()
                ->whereIn('contact_hash', $hashes)
                ->whereNotNull('confirmed_at')
                ->lockForUpdate()
                ->get();
            $taken = SavedSearch::query()->where('user_id', $user->id)->pluck('name')->all();
            $claimed = 0;

            foreach (SavedSearch::query()->whereIn('alert_subscriber_id', $subscribers->modelKeys())->orderBy('id')->get() as $search) {
                // `(user_id, name)` est unique : un nom déjà pris reçoit le numéro de la recherche,
                // testé AVANT d'écrire (une violation abandonnerait la transaction, piège n° 1).
                $name = in_array($search->name, $taken, true) ? $search->name.' #'.$search->id : $search->name;
                $search->forceFill(['user_id' => $user->id, 'alert_subscriber_id' => null, 'name' => $name])->save();
                $taken[] = $name;
                $claimed++;
            }
            AlertSubscriber::query()->whereKey($subscribers->modelKeys())->delete();

            return $claimed;
        });

        return $this->json(['data' => ['claimed' => $claimed]]);
    }

    /**
     * TCK-599 (ADR-0050, décision de session 4) — couper CETTE alerte depuis le lien de l'e-mail,
     * sans session : l'URL est signée (relative, 60 jours) et la route n'accepte que `POST` — un
     * scanneur de liens qui suit le lien ne désinscrit rien.
     */
    public function unsubscribe(SavedSearch $savedSearch): JsonResponse
    {
        $savedSearch->forceFill(['notification_frequency' => 'off'])->save();

        return $this->json(['data' => ['notification_frequency' => 'off']]);
    }

    public function destroy(Request $request, SavedSearch $savedSearch): JsonResponse
    {
        abort_unless($savedSearch->user_id === $request->user()->id, 403);
        $savedSearch->delete();

        return $this->json(['message' => 'deleted'], 204);
    }
}
