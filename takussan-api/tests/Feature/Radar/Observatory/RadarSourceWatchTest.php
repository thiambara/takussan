<?php

namespace Tests\Feature\Radar\Observatory;

use App\Jobs\SendAdminAlert;
use App\Models\Agency;
use App\Models\AlertRule;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Services\Radar\Crawl\RadarSnapshots;
use App\Services\Radar\Observatory\RadarSourceWatch;
use App\Services\Radar\RadarPurger;
use App\Support\RadarPhone;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2393 (ADR-0083 §3, §4) — AC2 à AC4 : une annonce source disparue alerte sur le bien publié, une fois ; « disparue »
 * ne se conclut que de passages terminés qui ont lu toute la liste — `radar.observe.confirm_runs` (2) d'affilée sans la
 * revoir ; une annonce revue redevient présente.
 */
class RadarSourceWatchTest extends TestCase
{
    use ConstruitLeMarche;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        $this->travelTo('2026-10-30 12:00:00');
        Queue::fake();
    }

    private function regle(): AlertRule
    {
        return AlertRule::create([
            'event' => RadarSourceWatch::EVENT,
            'channels_json' => ['email'],
            'recipients_json' => ['emails' => ['ops@example.test']],
            'is_active' => true,
        ]);
    }

    private function observer(): array
    {
        return app(RadarSourceWatch::class)->observe();
    }

    /**
     * AC2 — la source d'un bien publié n'est plus dans la liste lue jusqu'au bout : une alerte. L'annonce collectée est le
     * sujet (un journal de plateforme, sans agence) ; le bien est dans `properties.property_id`.
     */
    public function test_une_source_disparue_alerte_sur_le_bien_publie(): void
    {
        $regle = $this->regle();
        $bien = Property::factory()->published()->create();
        $annonce = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $bien->id]);
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $passage = $this->passage('2026-10-29 08:00:00');

        $this->assertSame(['gone' => 1, 'back' => 0, 'alerts' => 1], $this->observer());

        $annonce->refresh();
        $this->assertTrue($annonce->source_gone_at->eq($passage->finished_at));
        $this->assertSame($passage->id, $annonce->source_gone_run_id);
        Queue::assertPushed(SendAdminAlert::class, 1);
        Queue::assertPushed(SendAdminAlert::class, fn (SendAdminAlert $job) => $job->ruleId === $regle->id
            && $job->alert['event'] === RadarSourceWatch::EVENT
            && (int) $job->alert['subject_id'] === $annonce->id);

        $activite = Activity::query()->where('event', RadarSourceWatch::EVENT)->sole();
        $this->assertSame($annonce->getMorphClass(), $activite->subject_type);
        $this->assertSame($bien->id, $activite->properties['property_id']);
        $this->assertNull($activite->getAttribute('agency_id'));
        $this->assertSame('published', $activite->properties['link']);
        $this->assertTrue($activite->properties['property_public']);
        $this->assertSame(0, $activite->properties['other_sources_online']);
    }

    /** AC2 — une fois par disparition : la commande rejouée ne réalerte pas. */
    public function test_une_seule_alerte_par_disparition(): void
    {
        $this->regle();
        $bien = Property::factory()->published()->create();
        $annonce = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $bien->id]);
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        $this->artisan('radar:observe-sources')->expectsOutputToContain('gone=1')->assertSuccessful();
        $this->artisan('radar:observe-sources')->expectsOutputToContain('gone=0')->assertSuccessful();

        Queue::assertPushed(SendAdminAlert::class, 1);
    }

    /** AC2 — le doublon d'une annonce publiée est aussi une source du bien ; l'alerte dit que l'autre est encore en ligne. */
    public function test_le_doublon_d_une_annonce_publiee_alerte_sur_son_bien(): void
    {
        $this->regle();
        $bien = Property::factory()->published()->create();
        $publiee = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $bien->id], RadarSourceSite::Coinafrique);
        $this->instantane($publiee, '2026-10-20 08:00:00', '2026-10-29 09:00:00');
        $doublon = $this->annonceCollectee(['stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $publiee->id]);
        $this->instantane($doublon, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        $this->observer();

        $activite = Activity::query()->where('event', RadarSourceWatch::EVENT)->sole();
        $this->assertSame($doublon->id, (int) $activite->subject_id);
        $this->assertSame($bien->id, $activite->properties['property_id']);
        $this->assertSame('duplicate_of_listing', $activite->properties['link']);
        $this->assertSame(1, $activite->properties['other_sources_online']);
    }

    /** Une annonce disparue sans bien est marquée, sans alerte : le temps de mise sur le marché la lit. */
    public function test_une_annonce_sans_bien_est_marquee_sans_alerte(): void
    {
        $this->regle();
        $annonce = $this->annonceCollectee();
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        $this->assertSame(['gone' => 1, 'back' => 0, 'alerts' => 0], $this->observer());
        $this->assertNotNull($annonce->refresh()->source_gone_at);
        Queue::assertNothingPushed();
    }

    /** AC3 — un passage arrêté au plafond de pages, ou échoué, ne conclut rien ; seul le dernier passage complet juge. */
    public function test_seul_un_passage_termine_qui_a_lu_toute_la_liste_conclut(): void
    {
        $this->regle();
        $bien = Property::factory()->published()->create();
        $annonce = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $bien->id]);
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');

        // Un passage complet ANTÉRIEUR à la dernière présence ne dit rien d'elle.
        $this->passage('2026-10-27 08:00:00');
        // Un seul passage complet après elle : les suivants, incomplets ou non terminés, ne sont pas le second.
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00', finDeListe: false);
        $this->passage('2026-10-29 14:00:00', finDeListe: true, surcharge: ['status' => RadarCrawlStatus::Failed]);
        $this->passage('2026-10-29 16:00:00', finDeListe: true, surcharge: ['status' => RadarCrawlStatus::Running, 'finished_at' => null]);
        // Un passage complet d'un AUTRE site ne juge pas les annonces de celui-ci.
        $this->passage('2026-10-29 18:00:00', site: RadarSourceSite::Coinafrique);

        $this->assertSame(['gone' => 0, 'back' => 0, 'alerts' => 0], $this->observer());
        $this->assertNull($annonce->refresh()->source_gone_at);
        Queue::assertNothingPushed();
    }

    /** Une annonce saisie à la main, sans instantané, n'est jamais jugée. */
    public function test_une_annonce_sans_instantane_n_est_pas_jugee(): void
    {
        $annonce = $this->annonceCollectee();
        $this->passage('2026-10-29 08:00:00');

        $this->observer();

        $this->assertNull($annonce->refresh()->source_gone_at);
    }

    /** AC4 — revue par un passage postérieur, elle redevient présente, et une nouvelle disparition réalerte. */
    public function test_une_annonce_revue_redevient_presente_et_peut_realerter(): void
    {
        $this->regle();
        $bien = Property::factory()->published()->create();
        $annonce = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $bien->id]);
        $instantane = $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');
        $this->observer();
        $this->assertNotNull($annonce->refresh()->source_gone_at);

        // Un passage incomplet la revoit : elle est de retour.
        $this->passage('2026-10-30 08:00:00', finDeListe: false);
        $instantane->update(['last_seen_at' => '2026-10-30 08:03:00']);
        $this->assertSame(['gone' => 0, 'back' => 1, 'alerts' => 0], $this->observer());
        $this->assertNull($annonce->refresh()->source_gone_at);
        $this->assertNull($annonce->source_gone_run_id);

        // Puis deux passages complets ne la revoient plus : seconde disparition, seconde alerte.
        $this->passage('2026-10-30 10:00:00');
        $this->assertSame(['gone' => 0, 'back' => 0, 'alerts' => 0], $this->observer());
        $this->passage('2026-10-30 11:00:00');
        $this->assertSame(['gone' => 1, 'back' => 0, 'alerts' => 1], $this->observer());
        Queue::assertPushed(SendAdminAlert::class, 2);
    }

    /**
     * I1 (vérification adverse) — un seul passage complet sans l'annonce ne conclut pas : la liste a pu glisser pendant la
     * lecture (une annonce retirée en page 1 fait remonter la première de la page 2 dans une page déjà lue). Le second
     * passage complet d'affilée conclut, et date la disparition du sien.
     */
    public function test_un_seul_passage_complet_sans_l_annonce_ne_conclut_pas(): void
    {
        $this->regle();
        $bien = Property::factory()->published()->create();
        $annonce = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $bien->id]);
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');

        $this->passage('2026-10-28 20:00:00');
        $this->assertSame(['gone' => 0, 'back' => 0, 'alerts' => 0], $this->observer());
        $this->assertNull($annonce->refresh()->source_gone_at);
        Queue::assertNothingPushed();

        $second = $this->passage('2026-10-29 08:00:00');
        $this->assertSame(['gone' => 1, 'back' => 0, 'alerts' => 1], $this->observer());
        $this->assertSame($second->id, $annonce->refresh()->source_gone_run_id);
    }

    /** I1 — un retour remet le compte à zéro : un passage complet manqué, un passage qui la revoit, un passage manqué = 1. */
    public function test_un_retour_remet_le_compte_des_passages_a_zero(): void
    {
        $this->regle();
        $annonce = $this->annonceCollectee();
        $instantane = $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');

        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00', finDeListe: false);
        $instantane->update(['last_seen_at' => '2026-10-29 08:03:00']);
        $this->passage('2026-10-29 14:00:00');

        $this->assertSame(['gone' => 0, 'back' => 0, 'alerts' => 0], $this->observer());
        $this->assertNull($annonce->refresh()->source_gone_at);
    }

    /** I1 — le nombre de passages se règle : à 1, le premier passage complet conclut (le comportement d'avant). */
    public function test_le_nombre_de_passages_se_regle(): void
    {
        config(['radar.observe.confirm_runs' => 1]);
        $annonce = $this->annonceCollectee();
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-29 08:00:00');

        $this->assertSame(1, $this->observer()['gone']);

        config(['radar.observe.confirm_runs' => 3]);
        $autre = $this->annonceCollectee();
        $this->instantane($autre, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->assertSame(0, $this->observer()['gone']);
        $this->passage('2026-10-29 10:00:00');
        $this->passage('2026-10-29 12:00:00');
        $this->assertSame(1, $this->observer()['gone']);
    }

    /**
     * I2 (vérification adverse) — l'événement est un journal de PLATEFORME : l'agence du bien dont l'annonce collectée est
     * le doublon n'a rien à voir avec le Radar, et ne le lit pas dans son journal d'audit.
     */
    public function test_l_agence_du_bien_ne_lit_pas_l_evenement_dans_son_journal(): void
    {
        $agence = Agency::factory()->create();
        $bien = Property::factory()->published()->create(['agency_id' => $agence->id]);
        $annonce = $this->annonceCollectee(['stage' => RadarListingStage::Duplicate, 'duplicate_of_property_id' => $bien->id]);
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');
        $this->assertSame(1, $this->observer()['alerts']);

        $this->actingAsRole('agency_admin', ['agency' => $agence]);

        $this->getJson('/api/activity-log?filter[event]='.RadarSourceWatch::EVENT)
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->assertInstanceOf(RadarListing::class, Activity::query()->where('event', RadarSourceWatch::EVENT)->sole()->subject);
    }

    /**
     * Réserve n° 3 de TCK-2392, puis sa correction — la purge DÉTACHE les instantanés d'une annonce, et la collecte
     * n'observe plus une annonce purgée : elle n'est plus jugée, et n'alerte plus, même doublure d'un bien publié. Ses
     * instantanés restent au marché sans elle (`RadarObservatoryTest`).
     */
    public function test_une_annonce_purgee_n_est_plus_jugee_ni_n_alerte(): void
    {
        $this->regle();
        $bien = Property::factory()->published()->create();
        $publiee = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $bien->id], RadarSourceSite::Coinafrique);
        $this->instantane($publiee, '2026-10-20 08:00:00', '2026-10-29 09:00:00');
        $doublure = $this->annonceCollectee(['purge_at' => '2026-10-29 00:00:00', 'stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $publiee->id]);
        $this->instantane($doublure, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $sansBien = $this->annonceCollectee(['purge_at' => '2026-10-29 00:00:00']);
        $this->instantane($sansBien, '2026-10-20 08:00:00', '2026-10-28 08:05:00');

        $this->assertSame(2, app(RadarPurger::class)->run()['listings']);
        $this->passage('2026-10-29 20:00:00');
        $this->passage('2026-10-30 08:00:00');

        $this->assertSame(['gone' => 0, 'back' => 0, 'alerts' => 0], $this->observer());
        $this->assertNull($doublure->refresh()->source_gone_at);
        $this->assertNull($sansBien->refresh()->source_gone_at);
        $this->assertSame(RadarListingStage::Purged, $doublure->stage);
        Queue::assertNothingPushed();
    }

    /**
     * La collecte ne suit plus une annonce réduite au silence (TCK-2392, `RadarSnapshots::silenced()`) : `do_not_contact`, d'un
     * annonceur qui a dit STOP, ou purgée avec ses instantanés encore attachés (la purge d'une annonce publiée, TCK-2406). Ne
     * plus la voir ne dit donc rien d'elle : elle n'est pas jugée, et le bien qu'elle a publié n'alerte pas.
     */
    public function test_une_annonce_que_la_collecte_ne_suit_plus_n_est_pas_jugee(): void
    {
        $this->regle();
        $stop = RadarAdvertiser::query()->create([
            'phone' => '+221740000009',
            'phone_hmac' => RadarPhone::hmac('+221740000009'),
            'do_not_contact_at' => '2026-10-28 09:00:00',
        ]);
        $silencieuses = [
            $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => Property::factory()->published()->create()->id, 'radar_advertiser_id' => $stop->id]),
            $this->annonceCollectee(['stage' => RadarListingStage::DoNotContact, 'duplicate_of_property_id' => Property::factory()->published()->create()->id]),
            $this->annonceCollectee(['stage' => RadarListingStage::Purged, 'property_id' => Property::factory()->published()->create()->id]),
        ];
        foreach ($silencieuses as $annonce) {
            $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        }
        $suivie = $this->annonceCollectee();
        $this->instantane($suivie, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        $this->assertSame(['gone' => 1, 'back' => 0, 'alerts' => 0], $this->observer());
        $this->assertNotNull($suivie->refresh()->source_gone_at);
        foreach ($silencieuses as $annonce) {
            $this->assertNull($annonce->refresh()->source_gone_at);
        }
        Queue::assertNothingPushed();
    }

    /**
     * Vérification adverse, mineur n° 3 — la règle « la collecte ne la suit plus » est écrite deux fois : en PHP
     * (`RadarSnapshots::silenced()`, TCK-2392) et en SQL dans la veille. Sur les mêmes annonces — chaque étape, plus un
     * annonceur STOP —, la veille juge exactement celles que la collecte suit. Une étape ou un motif ajouté d'un seul côté
     * rougit ici.
     */
    public function test_la_veille_et_la_collecte_taisent_les_memes_annonces(): void
    {
        $stop = RadarAdvertiser::query()->create([
            'phone' => '+221740000010',
            'phone_hmac' => RadarPhone::hmac('+221740000010'),
            'do_not_contact_at' => '2026-10-28 09:00:00',
        ]);
        $libre = RadarAdvertiser::query()->create(['phone' => '+221740000011', 'phone_hmac' => RadarPhone::hmac('+221740000011')]);
        $cas = [];
        foreach (RadarListingStage::cases() as $etape) {
            $cas[$etape->value] = $this->annonceCollectee(['stage' => $etape, 'radar_advertiser_id' => $libre->id]);
        }
        $cas['annonceur STOP'] = $this->annonceCollectee(['radar_advertiser_id' => $stop->id]);
        $cas['sans annonceur'] = $this->annonceCollectee(['radar_advertiser_id' => null]);
        foreach ($cas as $annonce) {
            $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        }
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        $this->observer();

        $ecarts = [];
        foreach ($cas as $nom => $annonce) {
            $juge = $annonce->refresh()->source_gone_at !== null;
            if ($juge === RadarSnapshots::silenced($annonce)) {
                $ecarts[] = $nom.($juge ? ' : jugée par la veille, tue par la collecte' : ' : ni jugée, ni tue');
            }
        }
        $this->assertSame([], $ecarts);
    }

    /** La commande est planifiée toutes les quinze minutes, sans chevauchement. */
    public function test_la_commande_est_planifiee(): void
    {
        $evenements = collect(app(Schedule::class)->events())->filter(fn ($e) => str_contains((string) $e->command, 'radar:observe-sources'));

        $this->assertCount(1, $evenements);
        $this->assertSame('*/15 * * * *', $evenements->first()->expression);
        $this->assertTrue($evenements->first()->withoutOverlapping);
    }
}
