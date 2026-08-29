<?php

namespace App\Jobs;

use App\Models\Enums\NotificationType;
use App\Models\SavedSearch;
use App\Services\Model\NotificationService;
use App\Services\Model\SearchService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Alertes quotidiennes des recherches sauvegardées (`routes/console.php`, 09:00).
 *
 * ## TCK-350 — la décision, et ce qu'elle laisse dehors
 *
 * Ce job renotifiait les mêmes biens tous les jours, indéfiniment. La borne
 * temporelle était calculée ici puis JETÉE : elle était posée dans une variable
 * locale `$criteria` que `getMatchingProperties()` ne lisait pas — le service
 * relisait `criteria` depuis le modèle. Et `search()` n'aurait de toute façon
 * pas connu la clé. *Le sujet de la notification annonçait une nouveauté que le
 * calcul n'avait jamais vérifiée.*
 *
 * **L'option retenue : la borne est un ARGUMENT de méthode, jamais une clé de
 * `criteria`.** `getMatchingProperties($search, $borne)` la reçoit, et
 * `SearchService::search()` l'applique en SQL (`published_at > …`).
 *
 * Ce que cette forme fait tomber, et pourquoi les deux autres options ont été
 * écartées :
 *
 *  - **Injecter `published_after` dans `criteria`** mélangerait un critère
 *    d'utilisateur et un état d'envoi dans la même structure. L'objection porte
 *    sur la PERSISTANCE : `SearchService::saveSearch()` recopie *tout* le
 *    tableau qu'on lui passe dans la colonne. Un argument de méthode ne s'écrit
 *    dans aucune colonne, donc la migration future des `criteria` vers le
 *    vocabulaire de `/search` (ADR-0023) n'aura aucune clé à démêler.
 *  - **Filtrer après coup, ici, sur la collection rendue** paginerait puis
 *    jetterait : une recherche large peut ne rendre que des biens déjà notifiés
 *    dans sa première page et taire une nouveauté classée plus loin. Le filtre
 *    est donc DANS la requête.
 *  - **Une table de traçage** (`saved_search_notified_properties`) est le seul
 *    mécanisme qui tiendrait quand un bien est REPUBLIÉ, quand `published_at`
 *    est RÉTRODATÉ, ou quand la recherche est MODIFIÉE entre deux passages.
 *
 * ### ⚠ Ces trois cas-là restent NON COUVERTS, et c'est assumé
 *
 * La raison n'est pas qu'ils sont improbables : c'est qu'aucun d'eux n'existe
 * comme geste produit aujourd'hui. Les instruire demanderait d'abord de décider
 * ce que « republier » veut dire, ce qu'aucun ticket ne tranche. *Une table de
 * traçage posée pour des cas qu'aucun geste ne produit encore est une décision
 * prise trop tôt, et qu'il faudra défaire.* Le jour où l'un de ces gestes
 * apparaît, c'est LUI qui portera l'ADR et la table, avec le cas réel sous les
 * yeux. Aucun ADR n'est requis pour la forme actuelle : ni table, ni colonne.
 *
 * ## `notification_frequency` — les quatre valeurs, et celle qui ment
 *
 * La colonne était validée, persistée et exposée, mais AUCUN code d'envoi ne la
 * lisait : un utilisateur qui réglait son alerte sur `off` recevait quand même
 * une notification par jour. Elle est lue ici, dans `doitEnvoyer()` :
 *
 *  - `off`     → aucun envoi, et `last_notified_at` INCHANGÉ ;
 *  - `daily`   → comportement nominal ;
 *  - `weekly`  → envoi seulement si la dernière alerte est nulle ou vieille de
 *                7 jours ou plus ;
 *  - `instant` → **traité comme `daily`, et c'est une limite, pas un choix.**
 *                Un envoi réellement instantané suppose un déclencheur à la
 *                publication du bien, pas une planification à 09:00. *Le rendre
 *                silencieusement synonyme de `daily` sans le dire serait la
 *                troisième façon pour ce job de mentir sur ce qu'il fait.*
 *
 * ## ⚠ L'erreur d'UNE recherche ne doit pas tuer les suivantes — avec une réserve
 *
 * L'appel est enveloppé PAR RECHERCHE et l'échec journalisé avec l'`id`. Mais
 * sur PostgreSQL, **une erreur SQL abandonne la transaction entière**
 * (`SQLSTATE[25P02]`, cf. `CLAUDE.md`) : si ce job venait à tourner DANS une
 * transaction, le `try/catch` ci-dessous n'y changerait rien — toute requête
 * suivante échouerait à son tour, et les recherches d'après ne seraient pas
 * notifiées. Le `catch` protège des exceptions APPLICATIVES ; il ne répare pas
 * une transaction abandonnée. Le job est planifié hors transaction, et il doit
 * le rester. `SavedSearchAlertsTest` éprouve les deux cas.
 */
class SendSavedSearchAlerts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const JOURS_PAR_SEMAINE = 7;

    public function handle(SearchService $searchService, NotificationService $notifications): void
    {
        SavedSearch::with('user')
            ->where('is_active', true)
            ->whereNotNull('user_id')
            ->each(function (SavedSearch $search) use ($searchService, $notifications): void {
                try {
                    $this->traiter($search, $searchService, $notifications);
                } catch (Throwable $e) {
                    Log::error('saved_search_alert.failed', [
                        'saved_search_id' => $search->id,
                        'exception' => $e::class,
                        'message' => $e->getMessage(),
                    ]);
                }
            });
    }

    private function traiter(
        SavedSearch $search,
        SearchService $searchService,
        NotificationService $notifications,
    ): void {
        if (! $this->doitEnvoyer($search)) {
            return;
        }

        // La borne est relevée AVANT la requête, et c'est délibéré : un bien
        // publié pendant l'exécution serait sinon perdu POUR TOUJOURS — il
        // tomberait entre la requête et l'écriture de `last_notified_at`. Le
        // relever avant peut le renotifier une fois de plus ; le relever après
        // peut le taire définitivement, ce qui est le défaut que ce ticket
        // corrige.
        $borne = now();

        $matches = $searchService->getMatchingProperties($search, $search->last_notified_at);

        // ⚠ `last_notified_at` n'est PAS avancé quand rien n'est envoyé — ni
        // ici, ni par les retours de `doitEnvoyer()`. Sinon la borne dériverait
        // en silence à chaque passage muet, et une nouveauté publiée entre-temps
        // deviendrait invisible pour toujours.
        if ($matches->isEmpty()) {
            return;
        }

        $notifications->notify(
            $search->user,
            NotificationType::System,
            'Nouvelles propriétés correspondent à votre recherche',
            $matches->count().' bien(s) correspondent à votre recherche « '.($search->name).' ».',
            ['saved_search_id' => $search->id, 'count' => $matches->count()],
        );

        $search->update(['last_notified_at' => $borne]);
    }

    /**
     * ⚠ `notification_frequency` peut être ABSENTE de la charge utile
     * (`sometimes`, jamais `nullable` — TCK-330) ; la colonne est NOT NULL avec
     * un défaut `daily`. Le défaut de LECTURE est donc `daily` lui aussi, aligné
     * sur `SearchService::saveSearch()`.
     */
    private function doitEnvoyer(SavedSearch $search): bool
    {
        $frequence = $search->notification_frequency ?: 'daily';

        return match ($frequence) {
            'off' => false,
            'weekly' => $search->last_notified_at === null
                || $search->last_notified_at->lte(now()->subDays(self::JOURS_PAR_SEMAINE)),
            // `daily` et `instant` — cf. la limite écrite dans le docblock.
            default => true,
        };
    }
}
