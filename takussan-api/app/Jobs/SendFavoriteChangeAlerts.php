<?php

namespace App\Jobs;

use App\Models\Favorite;
use App\Models\User;
use App\Notifications\FavoriteChangesNotification;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-599 §5 — chaque jour, une notification GROUPÉE par personne : les baisses de prix de ses
 * favoris, et leurs sorties du public. Ce que le job compare, c'est l'état du jour à une base :
 *
 *  - **bien public** — prix < base → baisse annoncée, la base descend ; prix > base → la base
 *    monte sans rien annoncer (500 000 → 450 000 → 520 000 dans la journée : rien) ;
 *  - **bien sorti du public** (privé, loué, vendu, en attente, supprimé…) → annoncé UNE fois
 *    (`unavailable_notified_at`), sans son prix — même s'il a baissé le même jour (AC21) ;
 *  - **retour au public** → `unavailable_notified_at` repart à `null` et la base se recale sur le
 *    prix courant, sans rien annoncer (« de nouveau disponible » est hors périmètre).
 *
 * « Public » se juge par `scopePublic()` (via `withExists`), jamais par une copie. Les montants
 * se comparent en centimes entiers ({@see Favorite::cents()}), jamais en flottant.
 *
 * Idempotent : un second passage le même jour ne trouve plus d'écart. L'échec d'UNE personne est
 * journalisé sans contact ni message, et ne touche pas les suivantes ; ses bases restent en
 * l'état, le passage suivant la reprend.
 */
class SendFavoriteChangeAlerts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        User::query()
            ->whereHas('favorites')
            ->orderBy('id')
            ->each(function (User $user): void {
                try {
                    $this->traiter($user);
                } catch (Throwable $e) {
                    Log::error('favorite_alert.failed', ['user_id' => $user->id]
                        + Arr::except(SafeExceptionContext::of($e), ['message']));
                }
            });
    }

    private function traiter(User $user): void
    {
        /** @var Collection<int, Favorite> $favorites */
        $favorites = Favorite::query()
            ->where('user_id', $user->id)
            ->withExists(['property as property_is_public' => fn (Builder $q) => $q->public()])
            ->with(['property' => fn (BelongsTo $q) => $q->withTrashed()])
            ->orderBy('id')
            ->get();

        $drops = [];
        $gone = [];
        $updates = [];

        foreach ($favorites as $favorite) {
            $property = $favorite->property;
            $availability = Favorite::availabilityOf($property, (bool) $favorite->property_is_public);

            if ($availability !== Favorite::AVAILABLE) {
                if ($favorite->unavailable_notified_at === null) {
                    $gone[] = [
                        'property_id' => (int) $favorite->property_id,
                        'title' => (string) $property?->title,
                        'availability' => $availability,
                    ];
                    $updates[$favorite->id] = ['unavailable_notified_at' => now()];
                }

                continue;
            }

            $price = Favorite::cents($property->getRawOriginal('price'));
            $base = Favorite::cents($favorite->getRawOriginal('alert_baseline_price'));

            if ($favorite->unavailable_notified_at !== null) {
                $updates[$favorite->id] = ['unavailable_notified_at' => null, 'alert_baseline_price' => $property->getRawOriginal('price')];
            } elseif ($base === null || $price > $base) {
                $updates[$favorite->id] = ['alert_baseline_price' => $property->getRawOriginal('price')];
            } elseif ($price < $base) {
                $drops[] = [
                    'property_id' => (int) $favorite->property_id,
                    'title' => (string) $property->title,
                    'old' => (string) $favorite->getRawOriginal('alert_baseline_price'),
                    'new' => (string) $property->getRawOriginal('price'),
                    'currency' => $property->currency,
                ];
                $updates[$favorite->id] = ['alert_baseline_price' => $property->getRawOriginal('price')];
            }
        }

        // Les bases n'avancent qu'APRÈS l'envoi : un envoi qui échoue laisse l'écart en place, et
        // le passage suivant l'annonce.
        if ($drops !== []) {
            $user->notify(new FavoriteChangesNotification(FavoriteChangesNotification::KIND_PRICE_DROP, $drops));
        }
        if ($gone !== []) {
            $user->notify(new FavoriteChangesNotification(FavoriteChangesNotification::KIND_UNAVAILABLE, $gone));
        }

        DB::transaction(function () use ($updates): void {
            foreach ($updates as $id => $values) {
                Favorite::query()->whereKey($id)->update($values);
            }
        });
    }
}
