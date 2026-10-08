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
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
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
 * Le favori d'un bien dont l'agence est suspendue est GELÉ : ni annoncé, ni rebasé (ADR-0048).
 *
 * « Public » se juge par `scopePublic()` (via `withExists`), jamais par une copie. Les montants
 * se comparent en centimes entiers ({@see Favorite::cents()}), jamais en flottant.
 *
 * Idempotent : un second passage le même jour ne trouve plus d'écart. L'échec d'UNE personne est
 * journalisé sans contact ni message, et ne touche pas les suivantes ; ses bases restent en
 * l'état, le passage suivant la reprend.
 *
 * ## « Une fois », même quand deux passages se recouvrent (verif-599 M1)
 *
 * Le `withoutOverlapping()` du planificateur ne tient le verrou que pendant la MISE EN FILE : le
 * job tourne ensuite sans exclusion. Deux passages (deux planificateurs pendant un déploiement, un
 * lancement manuel, une relance après expiration) annonçaient tout deux fois — mesuré : 298
 * personnes sur 300. Deux gardes, et c'est la seconde qui porte la promesse :
 *
 *  1. un verrou de job (`WithoutOverlapping`, sans relâche) : un second passage pendant le premier
 *     est abandonné ;
 *  2. chaque annonce est RÉSERVÉE avant l'envoi par un `UPDATE` conditionnel sur l'état lu
 *     (`WHERE` l'ancienne base, l'ancien marqueur). Un passage qui a lu le même état avant la
 *     réservation de l'autre n'affecte aucune ligne, et n'annonce rien. Si l'envoi échoue, les
 *     réservations sont rendues (même `UPDATE`, à l'envers) : le passage suivant annonce.
 */
class SendFavoriteChangeAlerts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Un passage long n'est ni coupé à 60 s par le worker, ni rejoué : le suivant reprend. */
    public int $timeout = 1800;

    public int $tries = 1;

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping('favorite-change-alerts'))->dontRelease()->expireAfter($this->timeout + 60)];
    }

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
            // TCK-600 (ADR-0048 §1) — le bien d'une agence suspendue est MASQUÉ, pas sorti du
            // public : ni annoncé, ni rebasé. Il reprend à la levée, contre sa base d'avant.
            ->whereHas('property', fn (Builder $q) => $q->withTrashed()->ofPublicAgency())
            ->withExists(['property as property_is_public' => fn (Builder $q) => $q->public()])
            ->with(['property' => fn (BelongsTo $q) => $q->withTrashed()])
            ->orderBy('id')
            ->get();

        $drops = [];
        $gone = [];
        $updates = [];
        $lu = [];

        foreach ($favorites as $favorite) {
            $lu[$favorite->id] = [
                'alert_baseline_price' => $favorite->getRawOriginal('alert_baseline_price'),
                'unavailable_notified_at' => $favorite->getRawOriginal('unavailable_notified_at'),
            ];
            $property = $favorite->property;
            $availability = Favorite::availabilityOf($property, (bool) $favorite->property_is_public);

            if ($availability !== Favorite::AVAILABLE) {
                if ($favorite->unavailable_notified_at === null) {
                    $gone[] = [
                        'favorite_id' => (int) $favorite->id,
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
                    'favorite_id' => (int) $favorite->id,
                    'property_id' => (int) $favorite->property_id,
                    'title' => (string) $property->title,
                    'old' => (string) $favorite->getRawOriginal('alert_baseline_price'),
                    'new' => (string) $property->getRawOriginal('price'),
                    'currency' => $property->currency,
                ];
                $updates[$favorite->id] = ['alert_baseline_price' => $property->getRawOriginal('price')];
            }
        }

        // Réserver AVANT d'envoyer : seul ce que CE passage a fait avancer s'annonce.
        $reserves = [];
        foreach ($updates as $id => $values) {
            if ($this->deplacer($id, $lu[$id], $values)) {
                $reserves[$id] = $values;
            }
        }
        $drops = array_values(array_filter($drops, fn (array $item) => isset($reserves[$item['favorite_id']])));
        $gone = array_values(array_filter($gone, fn (array $item) => isset($reserves[$item['favorite_id']])));

        // Un envoi qui échoue rend SES réservations, et elles seules : l'écart reste, le passage
        // suivant l'annonce. L'annonce déjà partie garde les siennes (verif-599 m10) — rendre le
        // lot entier la faisait repartir. Un recalage muet n'a rien à rejouer.
        $echec = null;
        foreach ([FavoriteChangesNotification::KIND_PRICE_DROP => $drops, FavoriteChangesNotification::KIND_UNAVAILABLE => $gone] as $kind => $items) {
            if ($items === []) {
                continue;
            }
            try {
                $user->notify(new FavoriteChangesNotification($kind, $items));
            } catch (Throwable $e) {
                foreach ($items as $item) {
                    $this->deplacer($item['favorite_id'], $reserves[$item['favorite_id']], $lu[$item['favorite_id']]);
                }
                $echec ??= $e;
            }
        }

        if ($echec !== null) {
            throw $echec;
        }
    }

    /**
     * `UPDATE favorites SET <vers> WHERE id = ? AND <depuis>` — vrai si CETTE écriture a fait
     * passer la ligne de l'état lu à l'état visé.
     *
     * @param  array<string, mixed>  $depuis
     * @param  array<string, mixed>  $vers
     */
    private function deplacer(int $id, array $depuis, array $vers): bool
    {
        $query = Favorite::query()->whereKey($id);
        foreach (array_intersect_key($depuis, $vers) as $colonne => $valeur) {
            $valeur === null ? $query->whereNull($colonne) : $query->where($colonne, $valeur);
        }

        return $query->update($vers) === 1;
    }
}
