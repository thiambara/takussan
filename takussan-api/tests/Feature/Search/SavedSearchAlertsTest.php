<?php

namespace Tests\Feature\Search;

use App\Jobs\SendSavedSearchAlerts;
use App\Models\AppNotification;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Model\SearchService;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Tests\TestCase;
use Throwable;

/**
 * TCK-350 — les alertes de recherche sauvegardée.
 *
 * Ce chemin écrit aux utilisateurs tous les jours à 09:00 et n'avait AUCUN test.
 * Il renotifiait les mêmes biens indéfiniment, et ignorait `notification_frequency`
 * — donc `off` n'éteignait rien.
 *
 * ⚠ Ce chemin ne passe PAS par Meilisearch : `SearchService` est du SQL Eloquent.
 * Pas de `InteractsWithMeilisearch` ici.
 *
 * ⚠⚠ Le vocabulaire des filtres est celui de `SavedSearch.criteria`, qui diverge
 * de `/api/public/properties/search` (`max_price` ici, `price_max` là-bas) —
 * mesuré et écrit dans ADR-0023.
 */
class SavedSearchAlertsTest extends TestCase
{
    use RefreshDatabase;

    private const PLAFOND = 200_000;

    /** Le vocabulaire de `criteria`, et rien d'autre : aucune clé de contrôle. */
    private const CRITERIA = ['max_price' => self::PLAFOND];

    private function lancerLeJob(?SearchService $service = null): void
    {
        (new SendSavedSearchAlerts)->handle(
            $service ?? app(SearchService::class),
            app(NotificationService::class),
        );
    }

    private function recherche(User $user, array $attributs = []): SavedSearch
    {
        return SavedSearch::create([
            'user_id' => $user->id,
            'name' => 'Appartements abordables',
            'criteria' => self::CRITERIA,
            'notification_frequency' => 'daily',
            'is_active' => true,
            ...$attributs,
        ]);
    }

    private function bienPublieLe(CarbonInterface $date): Property
    {
        return Property::factory()->published()->create([
            'price' => self::PLAFOND - 50_000,
            'published_at' => $date,
        ]);
    }

    /** @return Collection<int,AppNotification> */
    private function notificationsDe(User $user): Collection
    {
        return AppNotification::where('user_id', $user->id)->orderBy('id')->get();
    }

    /**
     * **AC1 — deux passages consécutifs sans publication n'envoient qu'UNE notification.**
     *
     * ⚠ Le compte du PREMIER passage est asserté séparément, et c'est ce qui
     * distingue « le job ne renotifie plus » de « le job ne notifie plus rien » :
     * un job cassé cocherait sinon la moitié du critère.
     */
    public function test_deux_passages_consecutifs_sans_publication_n_envoient_qu_une_notification(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $this->bienPublieLe(now()->subDays(2));
        $recherche = $this->recherche($user);

        $this->lancerLeJob();

        $this->assertCount(1, $this->notificationsDe($user), 'le premier passage doit notifier');
        $this->assertSame(2, $this->notificationsDe($user)->first()->data['count']);

        $this->travel(1)->minutes();
        $this->lancerLeJob();

        $this->assertCount(1, $this->notificationsDe($user), 'le second passage ne doit rien ajouter');
        $this->assertTrue($recherche->refresh()->last_notified_at->isBefore(now()));
    }

    /**
     * **AC2 — un bien publié ENTRE les deux passages est notifié, et LUI SEUL.**
     *
     * ⚠ L'assertion porte sur `data.count`, pas sur la seule présence d'une
     * notification : sans elle, un correctif qui renotifie TOUT dès qu'un seul
     * bien est neuf passerait.
     */
    public function test_un_bien_publie_entre_deux_passages_est_notifie_et_lui_seul(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $this->bienPublieLe(now()->subDays(2));
        $this->recherche($user);

        $this->lancerLeJob();
        $this->assertSame(2, $this->notificationsDe($user)->first()->data['count']);

        $this->travel(1)->minutes();
        $this->bienPublieLe(now());

        $this->lancerLeJob();

        $notifications = $this->notificationsDe($user);
        $this->assertCount(2, $notifications);
        $this->assertSame(1, $notifications->last()->data['count']);
    }

    /**
     * **AC3 — `off` n'envoie RIEN, et `daily` envoie**, dans le même test, sur
     * deux recherches sœurs du même utilisateur.
     *
     * Les deux moitiés sont nécessaires : une garde qui écarterait tout le monde
     * cocherait la première seule.
     */
    public function test_la_frequence_off_n_envoie_rien_quand_daily_envoie(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());

        $muette = $this->recherche($user, ['name' => 'Muette', 'notification_frequency' => 'off']);
        $active = $this->recherche($user, ['name' => 'Active', 'notification_frequency' => 'daily']);

        $this->lancerLeJob();

        $notifications = $this->notificationsDe($user);
        $this->assertCount(1, $notifications);
        $this->assertSame($active->id, $notifications->first()->data['saved_search_id']);
        $this->assertNull($muette->refresh()->last_notified_at);
    }

    /**
     * La valeur peut être ABSENTE de la charge utile (`sometimes`, jamais
     * `nullable` — TCK-330). Le défaut de lecture est `daily`, aligné sur
     * `SearchService::saveSearch()`.
     */
    public function test_une_recherche_sans_frequence_explicite_notifie(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());

        SavedSearch::create([
            'user_id' => $user->id,
            'name' => 'Sans frequence',
            'criteria' => self::CRITERIA,
            'is_active' => true,
        ]);

        $this->lancerLeJob();

        $this->assertCount(1, $this->notificationsDe($user));
    }

    /**
     * `weekly` — envoi seulement si la dernière alerte est nulle ou vieille de
     * 7 jours ou plus. Les deux versants, dans le même test.
     */
    public function test_weekly_se_tait_avant_sept_jours_et_parle_apres(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        // ⚠ Le bien est publié APRÈS les deux bornes éprouvées ci-dessous : le
        // silence de la première moitié vient donc de la fréquence, et non de
        // l'absence de nouveauté. Un bien plus ancien rendrait ce test vert
        // pour la mauvaise raison — mesuré, il l'était.
        $this->bienPublieLe(now()->subDay());

        $recherche = $this->recherche($user, [
            'notification_frequency' => 'weekly',
            'last_notified_at' => now()->subDays(6),
        ]);

        $this->lancerLeJob();
        $this->assertCount(0, $this->notificationsDe($user), 'six jours ne suffisent pas');

        $recherche->update(['last_notified_at' => now()->subDays(8)]);

        $this->lancerLeJob();
        $this->assertCount(1, $this->notificationsDe($user), 'huit jours suffisent');
    }

    /**
     * **AC4 — `last_notified_at` n'est PAS avancé quand rien n'est envoyé.**
     *
     * Sinon la borne dérive en silence à chaque passage muet, et une nouveauté
     * publiée entre-temps devient invisible pour toujours. Assertion sur la
     * VALEUR EXACTE avant/après, sur les trois façons de ne rien envoyer :
     * aucun bien neuf, `off`, et `weekly` trop récente.
     */
    public function test_last_notified_at_n_est_pas_avance_quand_rien_n_est_envoye(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDays(30));
        $borne = now()->subDays(2);

        $sansNouveaute = $this->recherche($user, ['name' => 'Rien de neuf', 'last_notified_at' => $borne]);
        $eteinte = $this->recherche($user, [
            'name' => 'Eteinte',
            'notification_frequency' => 'off',
            'last_notified_at' => $borne,
        ]);
        $hebdo = $this->recherche($user, [
            'name' => 'Hebdo',
            'notification_frequency' => 'weekly',
            'last_notified_at' => $borne,
        ]);

        $this->travel(1)->minutes();
        $this->lancerLeJob();

        $this->assertCount(0, $this->notificationsDe($user));
        foreach ([$sansNouveaute, $eteinte, $hebdo] as $recherche) {
            $this->assertSame(
                $borne->toDateTimeString(),
                $recherche->refresh()->last_notified_at->toDateTimeString(),
                "la borne de « {$recherche->name} » a dérivé",
            );
        }
    }

    /**
     * **LE POINT DE CONTRÔLE de la décision d'étape 0.**
     *
     * `SearchService::saveSearch()` recopie *tout* `$criteria` dans la colonne.
     * Une clé `published_after` qui transiterait par le tableau y serait donc
     * PERSISTÉE, et la migration future des `criteria` vers le vocabulaire de
     * `/search` (ADR-0023) devrait démêler laquelle des clés n'en était pas une.
     *
     * C'est pourquoi la borne est un ARGUMENT de méthode. *Sans cette assertion,
     * la décision n'est qu'une intention.* Trois bords, et les trois comptent :
     * le tableau relu, la colonne au niveau du STOCKAGE (`criteria::text`), et
     * l'égalité stricte avec ce qui avait été enregistré.
     */
    public function test_aucune_ligne_saved_searches_ne_porte_published_after_apres_un_passage(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $recherche = $this->recherche($user);

        // Deux passages : le second est celui où la borne est RÉELLEMENT
        // calculée et appliquée — un seul passage ne prouverait rien.
        $this->lancerLeJob();
        $this->travel(1)->minutes();
        $this->assertNotNull($recherche->refresh()->last_notified_at, 'la borne doit avoir été posée');
        $this->lancerLeJob();

        $this->assertArrayNotHasKey('published_after', $recherche->refresh()->criteria);
        $this->assertSame(self::CRITERIA, $recherche->criteria);
        $this->assertSame(
            0,
            SavedSearch::whereRaw("criteria::text LIKE '%published_after%'")->count(),
            'aucune ligne saved_searches ne doit porter published_after dans criteria',
        );
    }

    /**
     * **AC5 — une exception APPLICATIVE sur une recherche ne tue pas les suivantes.**
     *
     * Le job itère par `each()` : avant TCK-350, une seule recherche fautive
     * interrompait toutes les alertes du jour.
     */
    public function test_une_exception_applicative_sur_une_recherche_ne_tue_pas_les_suivantes(): void
    {
        $this->freezeTime();
        Log::spy();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());

        $fautive = $this->recherche($user, ['name' => 'Fautive']);
        $suivante = $this->recherche($user, ['name' => 'Suivante']);

        $service = new class extends SearchService
        {
            public function getMatchingProperties(SavedSearch $search, ?CarbonInterface $publieApres = null): Collection
            {
                if ($search->name === 'Fautive') {
                    throw new RuntimeException('panne applicative');
                }

                return parent::getMatchingProperties($search, $publieApres);
            }
        };

        $this->lancerLeJob($service);

        $notifications = $this->notificationsDe($user);
        $this->assertCount(1, $notifications, 'la recherche suivante doit avoir été notifiée');
        $this->assertSame($suivante->id, $notifications->first()->data['saved_search_id']);
        $this->assertNull($fautive->refresh()->last_notified_at);
        Log::shouldHaveReceived('error')->withArgs(
            fn (string $canal, array $contexte) => $canal === 'saved_search_alert.failed'
                && $contexte['saved_search_id'] === $fautive->id
                && $contexte['exception'] === RuntimeException::class,
        )->once();
    }

    /**
     * **AC5, second cas — la LIMITE, éprouvée et non supposée.**
     *
     * Sur PostgreSQL, une erreur SQL abandonne la TRANSACTION ENTIÈRE
     * (`SQLSTATE[25P02]`, cf. `CLAUDE.md`) : toute commande suivante est refusée
     * jusqu'au `ROLLBACK`. Le `try/catch` par recherche protège donc des
     * exceptions applicatives — **il ne répare pas une transaction abandonnée**.
     *
     * Si ce job venait à tourner dans une transaction, une recherche dont les
     * `criteria` produisent une erreur SQL (`criteria` est un tableau LIBRE :
     * `min_price` peut y valoir n'importe quoi) ferait échouer les suivantes.
     * Ici la recherche saine échoue à son tour, journalisée comme la première.
     *
     * ⚠ Le job est planifié HORS transaction (`routes/console.php`), et il doit
     * le rester : c'est la seule chose qui rend ce cas théorique en production.
     *
     * ⚠⚠ Le `beginTransaction`/`rollBack` n'est pas une mise en scène : sous
     * `RefreshDatabase` le test tourne DÉJÀ dans une transaction, qu'une erreur
     * SQL abandonnerait — les assertions d'après rougiraient alors sur un
     * 25P02 en accusant le mauvais coupable. Le point de sauvegarde imbriqué
     * est ce qui rend la transaction du test à nouveau utilisable.
     */
    public function test_une_erreur_sql_dans_une_transaction_interrompt_bien_les_suivantes(): void
    {
        $this->freezeTime();
        Log::spy();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());

        $this->recherche($user, ['name' => 'SQL fautive', 'criteria' => ['min_price' => 'pas-un-nombre']]);
        $this->recherche($user, ['name' => 'Saine']);

        DB::beginTransaction();
        try {
            $this->lancerLeJob();
        } catch (Throwable) {
            // La sortie du job elle-même n'est pas le sujet : la limite l'est.
        } finally {
            DB::rollBack();
        }

        // ⚠ Les DEUX journaux sont assertés par leur SQLSTATE, et c'est le
        // cœur du test : `22P02` est l'erreur de la recherche fautive, `25P02`
        // celle que la transaction abandonnée inflige à la recherche SAINE.
        // Se contenter de compter deux erreurs laisserait passer deux pannes
        // sans rapport avec le mécanisme décrit ici.
        Log::shouldHaveReceived('error')->withArgs(
            fn (string $canal, array $contexte) => str_contains($contexte['message'], '22P02'),
        )->once();
        Log::shouldHaveReceived('error')->withArgs(
            fn (string $canal, array $contexte) => str_contains($contexte['message'], '25P02'),
        )->once();
    }
}
