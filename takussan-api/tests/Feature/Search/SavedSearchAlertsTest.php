<?php

namespace Tests\Feature\Search;

use App\Jobs\SendSavedSearchAlerts;
use App\Models\Address;
use App\Models\AppNotification;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyVisibility;
use App\Models\NotificationPreference;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Model\SearchService;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;
use Throwable;

/**
 * TCK-350 puis TCK-599 (ADR-0050) — les alertes de recherche sauvegardée.
 *
 * Depuis TCK-599, l'alerte passe par le moteur de `/properties` (Meilisearch), dans le vocabulaire
 * qu'écrit le front, sans repli, sur la fenêtre `]last_notified_at, maintenant − 10 min]`. Elle
 * part par `SavedSearchMatchesNotification` : cloche (`app_notifications`) et e-mail (transport
 * `array` de la suite — aucun envoi réel), dans la langue du destinataire.
 */
class SavedSearchAlertsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const PLAFOND = 200_000;

    /** Le vocabulaire de `/properties`, et rien d'autre : aucune clé de contrôle. */
    private const CRITERIA = ['price_max' => self::PLAFOND];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function lancerLeJob(?SearchService $service = null): void
    {
        (new SendSavedSearchAlerts)->handle($service ?? app(SearchService::class));
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

    private function bienPublieLe(CarbonInterface $date, array $attributs = [], array $adresse = []): Property
    {
        $bien = Property::factory()->published()->create([
            'price' => self::PLAFOND - 50_000,
            'currency' => Currency::XOF,
            'published_at' => $date,
            ...$attributs,
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
            'country' => 'SN',
            ...$adresse,
        ]);

        return $bien;
    }

    /** @return Collection<int,AppNotification> */
    private function notificationsDe(User $user): Collection
    {
        return AppNotification::where('user_id', $user->id)->orderBy('id')->get();
    }

    /** @return list<Email> */
    private function emailsA(string $adresse): array
    {
        return collect(app('mailer')->getSymfonyTransport()->messages())
            ->map(fn (SentMessage $m) => $m->getOriginalMessage())
            ->filter(fn (Email $e) => collect($e->getTo())->contains(fn ($a) => $a->getAddress() === $adresse))
            ->values()
            ->all();
    }

    /**
     * **TCK-350 AC1** — deux passages consécutifs sans publication n'envoient qu'UNE notification,
     * et le premier en envoie bien une (sinon « ne renotifie plus » et « ne notifie plus rien » se
     * confondraient).
     */
    public function test_deux_passages_consecutifs_sans_publication_n_envoient_qu_une_notification(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $this->bienPublieLe(now()->subDays(2));
        $recherche = $this->recherche($user);
        $this->indexProperties();

        $this->lancerLeJob();

        $this->assertCount(1, $this->notificationsDe($user), 'le premier passage doit notifier');
        $this->assertSame(2, $this->notificationsDe($user)->first()->data['total']);

        $this->travel(1)->minutes();
        $this->lancerLeJob();

        $this->assertCount(1, $this->notificationsDe($user), 'le second passage ne doit rien ajouter');
        $this->assertTrue($recherche->refresh()->last_notified_at->isBefore(now()));
    }

    /**
     * verif-599 M1 — un second passage qui a lu la même borne que le premier n'envoie rien de
     * plus : l'alerte est réservée avant l'envoi, sur la borne lue. Recouvrement rejoué de façon
     * déterministe.
     */
    public function test_deux_passages_qui_se_recouvrent_n_envoient_qu_une_fois(): void
    {
        $users = User::factory()->count(3)->create();
        $this->bienPublieLe(now()->subDay());
        foreach ($users as $user) {
            $this->recherche($user);
        }
        $this->indexProperties();
        // Le second passage tourne en entier APRÈS que le premier a lu l'état et AVANT qu'il ne
        // le réserve : le premier repart avec un état périmé, que sa réservation doit refuser.
        $imbrique = false;
        SavedSearch::retrieved(function () use (&$imbrique): void {
            if (! $imbrique) {
                $imbrique = true;
                $this->lancerLeJob();
            }
        });

        $this->lancerLeJob();

        $this->assertTrue($imbrique);
        foreach ($users as $user) {
            $this->assertCount(1, $this->notificationsDe($user));
        }
    }

    /** Un envoi qui échoue rend sa réservation : la borne reste, le passage suivant envoie. */
    public function test_un_envoi_qui_echoue_rend_sa_reservation(): void
    {
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $recherche = $this->recherche($user);
        $this->indexProperties();
        $echec = true;
        Event::listen(NotificationSending::class, function () use (&$echec): void {
            if ($echec) {
                throw new RuntimeException('transport indisponible');
            }
        });

        $this->lancerLeJob();
        $this->assertCount(0, $this->notificationsDe($user));
        $this->assertNull($recherche->refresh()->last_notified_at);

        $echec = false;
        $this->lancerLeJob();
        $this->assertCount(1, $this->notificationsDe($user));
    }

    /**
     * verif-599 m11 — l'e-mail en échec ne laisse pas de cloche : la cloche part en dernier, la
     * reprise l'écrit une seule fois.
     */
    public function test_un_e_mail_en_echec_ne_double_pas_la_cloche(): void
    {
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $this->recherche($user);
        $this->indexProperties();
        $echec = true;
        Event::listen(NotificationSending::class, function (NotificationSending $e) use (&$echec): void {
            if ($echec && $e->channel === 'mail') {
                throw new RuntimeException('transport indisponible');
            }
        });
        $mails = 0;
        Event::listen(NotificationSent::class, function (NotificationSent $e) use (&$mails): void {
            $mails += $e->channel === 'mail' ? 1 : 0;
        });

        $this->lancerLeJob();
        $this->assertCount(0, $this->notificationsDe($user), 'aucune cloche sans e-mail');

        $echec = false;
        $this->lancerLeJob();
        $this->assertCount(1, $this->notificationsDe($user));
        $this->assertSame(1, $mails);
    }

    /** Le verrou de job : un passage mis en file pendant qu'un autre tient le verrou est abandonné. */
    public function test_un_passage_pendant_un_autre_est_abandonne(): void
    {
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $this->recherche($user);
        $this->indexProperties();
        $verrou = Cache::lock('laravel-queue-overlap:'.SendSavedSearchAlerts::class.':saved-search-alerts', 600);
        $this->assertTrue($verrou->get());

        SendSavedSearchAlerts::dispatch();
        $this->assertCount(0, $this->notificationsDe($user));

        $verrou->release();
        SendSavedSearchAlerts::dispatch();
        $this->assertCount(1, $this->notificationsDe($user));
    }

    /**
     * **TCK-350 AC2 + ADR-0050 §1 (marge d'indexation)** — un bien publié entre deux passages est
     * notifié, LUI SEUL ; publié dans les dix minutes qui précèdent un passage, il attend le
     * suivant au lieu d'être perdu ou renvoyé.
     */
    public function test_un_bien_publie_entre_deux_passages_est_notifie_lui_seul_et_la_marge_le_reporte(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $this->recherche($user);
        $this->indexProperties();
        $this->lancerLeJob();
        $this->assertSame(1, $this->notificationsDe($user)->first()->data['total']);

        $this->travel(1)->hours();
        $recent = $this->bienPublieLe(now()->subMinutes(5));
        $this->indexProperties();
        $this->lancerLeJob();
        $this->assertCount(1, $this->notificationsDe($user), 'publié il y a cinq minutes : pas encore');

        $this->travel(1)->days();
        $this->lancerLeJob();

        $notifications = $this->notificationsDe($user);
        $this->assertCount(2, $notifications, 'le passage suivant le rattrape');
        $this->assertSame([$recent->id], $notifications->last()->data['property_ids']);

        $this->travel(1)->days();
        $this->lancerLeJob();
        $this->assertCount(2, $this->notificationsDe($user), 'et ne le renvoie jamais');
    }

    /** **TCK-350 AC3** — `off` n'envoie RIEN quand `daily` envoie, sur deux recherches sœurs. */
    public function test_la_frequence_off_n_envoie_rien_quand_daily_envoie(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $muette = $this->recherche($user, ['name' => 'Muette', 'notification_frequency' => 'off']);
        $active = $this->recherche($user, ['name' => 'Active', 'notification_frequency' => 'daily']);
        $this->indexProperties();

        $this->lancerLeJob();

        $notifications = $this->notificationsDe($user);
        $this->assertCount(1, $notifications);
        $this->assertSame($active->id, $notifications->first()->data['saved_search_id']);
        $this->assertNull($muette->refresh()->last_notified_at);
    }

    /** La fréquence peut être ABSENTE (`sometimes`, TCK-330) : le défaut de lecture est `daily`. */
    public function test_une_recherche_sans_frequence_explicite_notifie(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        SavedSearch::create(['user_id' => $user->id, 'name' => 'Sans frequence', 'criteria' => self::CRITERIA, 'is_active' => true]);
        $this->indexProperties();

        $this->lancerLeJob();

        $this->assertCount(1, $this->notificationsDe($user));
    }

    /** `weekly` se tait avant sept jours et parle après — le bien est postérieur aux deux bornes. */
    public function test_weekly_se_tait_avant_sept_jours_et_parle_apres(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $recherche = $this->recherche($user, ['notification_frequency' => 'weekly', 'last_notified_at' => now()->subDays(6)]);
        $this->indexProperties();

        $this->lancerLeJob();
        $this->assertCount(0, $this->notificationsDe($user), 'six jours ne suffisent pas');

        $recherche->update(['last_notified_at' => now()->subDays(8)]);
        $this->lancerLeJob();
        $this->assertCount(1, $this->notificationsDe($user), 'huit jours suffisent');
    }

    /** **TCK-350 AC4** — `last_notified_at` n'avance PAS quand rien n'est envoyé, sous les trois formes. */
    public function test_last_notified_at_n_est_pas_avance_quand_rien_n_est_envoye(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDays(30));
        $borne = now()->subDays(2);
        $recherches = [
            $this->recherche($user, ['name' => 'Rien de neuf', 'last_notified_at' => $borne]),
            $this->recherche($user, ['name' => 'Eteinte', 'notification_frequency' => 'off', 'last_notified_at' => $borne]),
            $this->recherche($user, ['name' => 'Hebdo', 'notification_frequency' => 'weekly', 'last_notified_at' => $borne]),
        ];
        $this->indexProperties();

        $this->travel(1)->minutes();
        $this->lancerLeJob();

        $this->assertCount(0, $this->notificationsDe($user));
        foreach ($recherches as $recherche) {
            $this->assertSame($borne->toDateTimeString(), $recherche->refresh()->last_notified_at->toDateTimeString(), "la borne de « {$recherche->name} » a dérivé");
        }
    }

    /** La borne est un ARGUMENT : aucune ligne ne porte `published_after`, deux passages plus tard. */
    public function test_aucune_ligne_saved_searches_ne_porte_published_after_apres_un_passage(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $recherche = $this->recherche($user);
        $this->indexProperties();

        $this->lancerLeJob();
        $this->travel(1)->minutes();
        $this->assertNotNull($recherche->refresh()->last_notified_at, 'la borne doit avoir été posée');
        $this->lancerLeJob();

        $this->assertSame(self::CRITERIA, $recherche->refresh()->criteria);
        $this->assertSame(0, SavedSearch::whereRaw("criteria::text LIKE '%published_after%'")->count());
    }

    /**
     * @return array<string, array{array<string, mixed>, array{array<string,mixed>, array<string,mixed>}, array{array<string,mixed>, array<string,mixed>}}>
     */
    public static function tableauAc8(): array
    {
        return [
            'location · Dakar · ≤ 300 000' => [
                ['contract_type' => 'rent', 'city' => 'Dakar', 'price_max' => 300000],
                [['contract_type' => 'rent', 'rent_period' => 'monthly', 'price' => 250_000], []],
                [['contract_type' => 'rent', 'rent_period' => 'monthly', 'price' => 900_000], []],
            ],
            'Dakar · ≥ 100 m²' => [
                ['city' => 'Dakar', 'area_min' => 100],
                [['area' => 120], []],
                [['area' => 60], []],
            ],
            'Dakar · Almadies' => [
                ['city' => 'Dakar', 'location' => 'Almadies'],
                [[], ['neighborhood' => 'Almadies']],
                [[], ['neighborhood' => 'Médina']],
            ],
            'cities (préférences)' => [
                ['cities' => ['Dakar', 'Thiès']],
                [[], ['city' => 'Thiès']],
                [[], ['city' => 'Saint-Louis']],
            ],
            'Dakar · « piscine »' => [
                ['city' => 'Dakar', 'q' => 'piscine'],
                [['title' => 'Villa avec piscine', 'description' => 'Belle maison.'], []],
                [['title' => 'Villa vue mer', 'description' => 'Belle maison.'], []],
            ],
            'location · mensuelle' => [
                ['contract_type' => 'rent', 'rent_period' => 'monthly'],
                [['contract_type' => 'rent', 'rent_period' => 'monthly'], []],
                [['contract_type' => 'rent', 'rent_period' => 'daily'], []],
            ],
        ];
    }

    /**
     * **AC8** — la recherche est créée par `POST /api/saved-searches` dans la forme exacte du
     * front ; `B` ne correspond QUE par le critère éprouvé. L'alerte liste `A`, jamais `B`.
     *
     * @param  array<string, mixed>  $criteria
     * @param  array{array<string,mixed>, array<string,mixed>}  $a
     * @param  array{array<string,mixed>, array<string,mixed>}  $b
     */
    #[DataProvider('tableauAc8')]
    public function test_l_alerte_applique_le_vocabulaire_ecrit_par_le_front(array $criteria, array $a, array $b): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $this->postJson('/api/saved-searches', ['name' => 'AC8', 'criteria' => $criteria, 'notification_frequency' => 'daily'])->assertCreated();

        $neutre = ['type' => 'villa', 'title' => 'Villa lumineuse', 'description' => 'Belle maison.'];
        $bienA = $this->bienPublieLe(now()->subHour(), [...$neutre, ...$a[0]], $a[1]);
        $this->bienPublieLe(now()->subHour(), [...$neutre, ...$b[0]], $b[1]);
        $this->indexProperties();

        $this->lancerLeJob();

        $this->assertSame([$bienA->id], $this->notificationsDe($user)->sole()->data['property_ids']);
    }

    /**
     * **ADR-0024 interdit ici** — `villa Saly` sans aucun bien à Saly : la liste publique
     * élargirait (`strategy: widened`) ; l'alerte, elle, se tait.
     */
    public function test_l_alerte_ne_relache_jamais_un_terme(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay(), ['title' => 'Villa lumineuse', 'description' => 'Belle maison.']);
        $this->recherche($user, ['criteria' => ['q' => 'villa saly']]);
        $this->indexProperties();

        $this->assertSame('widened', $this->getJson('/api/public/properties/search?q=villa%20saly')->json('search.strategy'), 'la liste élargit bien');

        $this->lancerLeJob();

        $this->assertCount(0, $this->notificationsDe($user));
    }

    /**
     * **AC11** — 25 biens correspondent : `total = 25`, cinq identifiants, et l'e-mail porte le
     * prix formaté et le quartier de ces cinq biens, et le lien localisé vers les 25.
     */
    public function test_l_alerte_annonce_le_total_reel_et_decrit_cinq_biens(): void
    {
        $this->freezeTime();
        $user = User::factory()->create(['preferred_language' => 'fr']);
        foreach (range(1, 25) as $i) {
            $this->bienPublieLe(now()->subMinutes(20 + $i), ['price' => 100_000 + $i * 1_000], ['neighborhood' => "Quartier {$i}"]);
        }
        $this->recherche($user, ['criteria' => ['price_max' => 200000, 'city' => 'Dakar']]);
        $this->indexProperties();

        $this->lancerLeJob();

        $data = $this->notificationsDe($user)->sole()->data;
        $this->assertSame(25, $data['total']);
        $this->assertCount(5, $data['property_ids']);

        $mail = $this->emailsA($user->email)[0];
        $html = (string) $mail->getHtmlBody();
        $formatter = app(CurrencyFormatter::class);
        foreach (Property::with('address')->findMany($data['property_ids']) as $bien) {
            $this->assertStringContainsString(e($formatter->format((float) $bien->price, Currency::XOF, 'fr')), $html, "prix du bien {$bien->id}");
            $this->assertStringContainsString($bien->address->neighborhood, $html, "quartier du bien {$bien->id}");
        }
        // `jsonb` range les clés à sa façon : l'ordre des paramètres n'est pas le sujet.
        $this->assertStringContainsString(e(rtrim((string) config('app.frontend_url'), '/').'/fr/properties?city=Dakar&price_max=200000'), $html);
        $this->assertStringContainsString('25', (string) $mail->getSubject().$html);
    }

    /**
     * **AC12** — l'alerte obéit à `saved_search_match`, plus à `threshold_alert` : couper le
     * premier coupe l'e-mail, couper le second ne coupe rien.
     */
    public function test_l_e_mail_obeit_a_saved_search_match_et_plus_a_threshold_alert(): void
    {
        $this->freezeTime();
        $coupee = User::factory()->create();
        $kpiCoupe = User::factory()->create();
        NotificationPreference::updateOrCreate(['user_id' => $coupee->id, 'event_type' => 'saved_search_match', 'channel' => 'email'], ['enabled' => false]);
        NotificationPreference::updateOrCreate(['user_id' => $kpiCoupe->id, 'event_type' => 'threshold_alert', 'channel' => 'email'], ['enabled' => false]);
        $this->bienPublieLe(now()->subDay());
        $this->recherche($coupee);
        $this->recherche($kpiCoupe);
        $this->indexProperties();

        $this->lancerLeJob();

        $this->assertCount(0, $this->emailsA($coupee->email), 'saved_search_match coupé : aucun e-mail');
        $this->assertCount(1, $this->notificationsDe($coupee), 'la cloche reste (invariant in-app de TCK-588)');
        $this->assertCount(1, $this->emailsA($kpiCoupe->email), 'threshold_alert coupé : l\'alerte de recherche part');
    }

    /** **AC13** — un destinataire `wo` reçoit les clés rendues en wolof, différentes du français. */
    public function test_le_titre_et_le_corps_sont_dans_la_langue_du_destinataire(): void
    {
        $this->freezeTime();
        $user = User::factory()->create(['preferred_language' => 'wo']);
        $this->bienPublieLe(now()->subDay());
        $this->bienPublieLe(now()->subDays(2));
        $this->recherche($user, ['name' => 'Kër Dakar']);
        $this->indexProperties();

        $this->lancerLeJob();

        $ligne = $this->notificationsDe($user)->sole();
        $p = ['name' => 'Kër Dakar', 'total' => 2];
        $this->assertSame(__('saved_search_alerts.title', $p, 'wo'), $ligne->title);
        $this->assertSame(trans_choice('saved_search_alerts.body', 2, $p, 'wo'), $ligne->body);
        $this->assertNotSame(__('saved_search_alerts.title', $p, 'fr'), $ligne->title);
        $this->assertSame(__('saved_search_alerts.title', $p, 'wo'), $this->emailsA($user->email)[0]->getSubject());
    }

    /**
     * **AC18 (compte)** — l'e-mail porte `List-Unsubscribe` (un POST sur l'API, URL signée) et
     * `List-Unsubscribe-Post` ; un GET de l'URL ne coupe rien, le POST coupe CETTE alerte.
     */
    public function test_l_e_mail_porte_la_desinscription_en_un_clic_qui_ne_cede_qu_a_un_post(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $recherche = $this->recherche($user);
        $soeur = $this->recherche($user, ['name' => 'Soeur']);
        $this->indexProperties();

        $this->lancerLeJob();

        $mail = $this->emailsA($user->email)[0];
        $this->assertSame('List-Unsubscribe=One-Click', $mail->getHeaders()->get('List-Unsubscribe-Post')?->getBodyAsString());
        $uri = trim((string) $mail->getHeaders()->get('List-Unsubscribe')?->getBodyAsString(), '<>');
        $chemin = parse_url($uri, PHP_URL_PATH).'?'.parse_url($uri, PHP_URL_QUERY);
        $this->assertStringContainsString("/api/saved-searches/{$recherche->id}/unsubscribe", $chemin);

        $this->getJson($chemin)->assertStatus(405);
        $this->assertSame('daily', $recherche->refresh()->notification_frequency);

        $this->postJson($chemin)->assertOk();
        $this->assertSame('off', $recherche->refresh()->notification_frequency);
        $this->assertSame('daily', $soeur->refresh()->notification_frequency, 'seulement CETTE alerte');

        $this->postJson("/api/saved-searches/{$soeur->id}/unsubscribe?".parse_url($uri, PHP_URL_QUERY))->assertForbidden();
    }

    /** Un bien sorti du public entre l'indexation et l'envoi n'est jamais décrit. */
    public function test_un_bien_sorti_du_public_avant_l_envoi_n_est_pas_decrit(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $public = $this->bienPublieLe(now()->subDay());
        $prive = $this->bienPublieLe(now()->subDay(), ['title' => 'Bien devenu privé']);
        $this->recherche($user);
        $this->indexProperties();
        Property::withoutSyncingToSearch(fn () => $prive->forceFill(['visibility' => PropertyVisibility::Private])->save());

        $this->lancerLeJob();

        $this->assertSame([$public->id], $this->notificationsDe($user)->sole()->data['property_ids']);
        $this->assertStringNotContainsString('Bien devenu privé', (string) $this->emailsA($user->email)[0]->getHtmlBody());
    }

    /** **TCK-350 AC5** — une exception APPLICATIVE sur une recherche ne tue pas les suivantes. */
    public function test_une_exception_applicative_sur_une_recherche_ne_tue_pas_les_suivantes(): void
    {
        $this->freezeTime();
        Log::spy();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $fautive = $this->recherche($user, ['name' => 'Fautive']);
        $suivante = $this->recherche($user, ['name' => 'Suivante']);
        $this->indexProperties();

        $this->lancerLeJob(new class extends SearchService
        {
            public function getMatchingProperties(SavedSearch $search, ?CarbonInterface $publieApres = null, ?CarbonInterface $jusqua = null): array
            {
                if ($search->name === 'Fautive') {
                    throw new RuntimeException('panne applicative');
                }

                return parent::getMatchingProperties($search, $publieApres, $jusqua);
            }
        });

        $this->assertSame($suivante->id, $this->notificationsDe($user)->sole()->data['saved_search_id']);
        $this->assertNull($fautive->refresh()->last_notified_at);
        Log::shouldHaveReceived('error')->withArgs(
            fn (string $canal, array $contexte) => $canal === 'saved_search_alert.failed'
                && $contexte['saved_search_id'] === $fautive->id
                && $contexte['exception'] === RuntimeException::class
                && ! array_key_exists('message', $contexte),
        )->once();
    }

    /**
     * **TCK-350 AC5, second cas — la LIMITE.** Sur PostgreSQL, une erreur SQL abandonne la
     * transaction entière : si le job tournait dans une transaction, la recherche saine échouerait
     * à son tour (25P02). Les deux SQLSTATE sont lus dans `SafeExceptionContext`, sans message.
     */
    public function test_une_erreur_sql_dans_une_transaction_interrompt_bien_les_suivantes(): void
    {
        $this->freezeTime();
        Log::spy();
        $user = User::factory()->create();
        $this->bienPublieLe(now()->subDay());
        $this->recherche($user, ['name' => 'SQL fautive']);
        $this->recherche($user, ['name' => 'Saine']);
        $this->indexProperties();

        $service = new class extends SearchService
        {
            public function getMatchingProperties(SavedSearch $search, ?CarbonInterface $publieApres = null, ?CarbonInterface $jusqua = null): array
            {
                if ($search->name === 'SQL fautive') {
                    DB::select("select 'pas-un-nombre'::int");
                }

                return parent::getMatchingProperties($search, $publieApres, $jusqua);
            }
        };

        DB::beginTransaction();
        try {
            $this->lancerLeJob($service);
        } catch (Throwable) {
            // La sortie du job n'est pas le sujet : la limite l'est.
        } finally {
            DB::rollBack();
        }

        Log::shouldHaveReceived('error')->withArgs(fn (string $canal, array $contexte) => ($contexte['sqlstate'] ?? null) === '22P02')->once();
        Log::shouldHaveReceived('error')->withArgs(fn (string $canal, array $contexte) => ($contexte['sqlstate'] ?? null) === '25P02')->once();
    }
}
