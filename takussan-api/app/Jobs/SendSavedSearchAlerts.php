<?php

namespace App\Jobs;

use App\Models\SavedSearch;
use App\Notifications\SavedSearchMatchesNotification;
use App\Services\Model\SearchService;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Alertes quotidiennes des recherches sauvegardées (`routes/console.php`, 09:00).
 *
 * ## TCK-599 (ADR-0050) — ce que l'alerte rend
 *
 * Les biens que `/properties` aurait rendus pour ces critères, par le MÊME moteur
 * (`PropertySearchService::alertMatches()`), sans repli, publiés dans la fenêtre
 * `]last_notified_at, maintenant − 10 min]` : la marge couvre le délai d'indexation — un bien
 * publié dans les dix dernières minutes attend le passage suivant au lieu d'être perdu ou
 * renvoyé. La borne haute devient `last_notified_at`.
 *
 * Deux destinataires : le compte, et l'abonné sans compte CONFIRMÉ (une demande non confirmée
 * n'est jamais servie). L'envoi passe par `SavedSearchMatchesNotification`, plus par
 * `NotificationService::notify()` : l'alerte obéit à `saved_search_match`, plus à
 * `threshold_alert`, et ce job n'écrit plus aucune prose.
 *
 * ## TCK-350 — la borne est un ARGUMENT, jamais une clé de `criteria`
 *
 * La borne était calculée puis jetée dans un tableau local que le service ne lisait pas. Elle
 * est passée en argument à `getMatchingProperties()`, filtrée DANS le moteur (filtrer après coup
 * paginerait puis jetterait), et ne s'écrit dans aucune colonne.
 *
 * ### ⚠ Restent NON COUVERTS, et c'est assumé
 *
 * Un bien REPUBLIÉ, un `published_at` RÉTRODATÉ, une recherche MODIFIÉE entre deux passages :
 * aucun n'est un geste produit aujourd'hui. Une table de traçage posée pour eux serait une
 * décision prise trop tôt ; le geste qui les fera exister portera l'ADR et la table.
 *
 * ## `notification_frequency`
 *
 *  - `off`    → aucun envoi, et `last_notified_at` INCHANGÉ ;
 *  - `daily`  → comportement nominal ;
 *  - `weekly` → envoi seulement si la dernière alerte est nulle ou vieille de 7 jours ou plus.
 *
 * `instant` a été **retiré le 2026-10-06 par décision du porteur** (TCK-599) : il n'a jamais été
 * instantané, et la migration `retire_instant_saved_search_frequency` l'a ramené à `daily`.
 *
 * ## ⚠ L'erreur d'UNE recherche ne doit pas tuer les suivantes — avec une réserve
 *
 * L'appel est enveloppé PAR RECHERCHE. Le journal ne porte que des identifiants et la forme sûre
 * de l'exception (`SafeExceptionContext`, TCK-601) **sans** son `message` : toute exception de
 * cette boucle peut citer le destinataire (refus SMTP, numéro WhatsApp, valeur liée d'une
 * requête). Sur PostgreSQL, une erreur SQL abandonne la transaction entière (`SQLSTATE[25P02]`) :
 * le `catch` protège des exceptions applicatives, il ne répare pas une transaction abandonnée. Le
 * job est planifié hors transaction, et il doit le rester. `SavedSearchAlertsTest` éprouve les
 * deux cas.
 *
 * ## « Une fois », même quand deux passages se recouvrent (verif-599 M1)
 *
 * Le `withoutOverlapping()` du planificateur ne protège que la MISE EN FILE. Deux passages qui se
 * recouvraient envoyaient chaque alerte deux fois (mesuré : 150 sur 150). Comme
 * `SendFavoriteChangeAlerts` : un verrou de job, et surtout une RÉSERVATION avant l'envoi —
 * `UPDATE … SET last_notified_at = :borne WHERE id = ? AND last_notified_at IS NOT DISTINCT FROM
 * :lue`. Un passage qui a lu la même borne n'affecte aucune ligne et n'envoie rien ; un envoi qui
 * échoue rend la réservation.
 */
class SendSavedSearchAlerts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const JOURS_PAR_SEMAINE = 7;

    /** Un passage long n'est ni coupé à 60 s par le worker, ni rejoué : le suivant reprend. */
    public int $timeout = 1800;

    public int $tries = 1;

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping('saved-search-alerts'))->dontRelease()->expireAfter($this->timeout + 60)];
    }

    public function handle(SearchService $searchService): void
    {
        SavedSearch::with(['user', 'alertSubscriber'])
            ->where('is_active', true)
            ->where(fn (Builder $q) => $q
                ->whereNotNull('user_id')
                ->orWhereHas('alertSubscriber', fn (Builder $s) => $s->whereNotNull('confirmed_at')))
            ->each(function (SavedSearch $search) use ($searchService): void {
                try {
                    $this->traiter($search, $searchService);
                } catch (Throwable $e) {
                    Log::error('saved_search_alert.failed', [
                        'saved_search_id' => $search->id,
                        'alert_subscriber_id' => $search->alert_subscriber_id,
                    ] + Arr::except(SafeExceptionContext::of($e), ['message']));
                }
            });
    }

    private function traiter(SavedSearch $search, SearchService $searchService): void
    {
        $recipient = $search->recipient();
        if ($recipient === null || ! $this->doitEnvoyer($search)) {
            return;
        }

        // La borne haute est relevée AVANT la requête, et en retrait du délai d'indexation : un
        // bien publié pendant l'exécution, ou pas encore indexé, tombe dans la fenêtre suivante
        // au lieu d'être perdu pour toujours.
        $borne = now()->subMinutes((int) config('search_alerts.index_margin_minutes', 10));

        ['properties' => $properties, 'total' => $total] = $searchService->getMatchingProperties(
            $search,
            $search->last_notified_at,
            $borne,
        );

        // ⚠ `last_notified_at` n'avance PAS quand rien n'est envoyé : sinon la borne dériverait
        // en silence à chaque passage muet.
        if ($total === 0) {
            return;
        }

        $lue = $search->getRawOriginal('last_notified_at');
        if (! $this->deplacer($search, $lue, $borne)) {
            return;
        }

        try {
            $recipient->notify(new SavedSearchMatchesNotification($search, $properties, $total));
        } catch (Throwable $e) {
            $this->deplacer($search, $borne, $lue);

            throw $e;
        }
    }

    /**
     * ⚠ `notification_frequency` peut être ABSENTE de la charge utile (`sometimes`, jamais
     * `nullable` — TCK-330) ; la colonne est NOT NULL avec un défaut `daily`.
     */
    private function doitEnvoyer(SavedSearch $search): bool
    {
        $frequence = $search->notification_frequency ?: 'daily';

        return match ($frequence) {
            'off' => false,
            'weekly' => $search->last_notified_at === null
                || $search->last_notified_at->lte(now()->subDays(self::JOURS_PAR_SEMAINE)),
            'daily' => true,
            // Une valeur hors de `off|daily|weekly` ne passe plus la validation ; une ligne qui en
            // porterait une encore n'envoie rien plutôt que de deviner.
            default => false,
        };
    }

    /** `UPDATE … SET last_notified_at = :vers WHERE id = ? AND last_notified_at IS NOT DISTINCT FROM :depuis`. */
    private function deplacer(SavedSearch $search, mixed $depuis, mixed $vers): bool
    {
        $query = SavedSearch::query()->whereKey($search->getKey());
        $depuis === null ? $query->whereNull('last_notified_at') : $query->where('last_notified_at', $depuis);

        return $query->update(['last_notified_at' => $vers]) === 1;
    }
}
