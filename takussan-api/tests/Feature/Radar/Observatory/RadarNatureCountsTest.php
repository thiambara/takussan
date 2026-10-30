<?php

namespace Tests\Feature\Radar\Observatory;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarNatureCount;
use App\Services\Radar\Observatory\RadarNatureCounter;
use App\Services\Radar\Observatory\RadarObservatory;
use App\Support\RadarPhone;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2431 (ADR-0077 §9, ADR-0083) — les compteurs anonymes par nature : chaque jour, AVANT la purge, le nombre d'annonceurs
 * et d'annonces par nature présumée. AC1 : la part par nature d'une période passée est la même avant et après la purge.
 */
class RadarNatureCountsTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private int $numero = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        $this->freezeTime();
        $this->travelTo('2026-10-01 10:00:00');
        // Éteint par défaut (avis juridique de TCK-2434) : ces tests décrivent le comptage ALLUMÉ, sauf ceux qui l'éteignent.
        config(['radar.nature_counts.enabled' => true]);
    }

    /** Un annonceur de cette nature, porteur de `$annonces` annonces jamais publiées (échéance de purge : 90 jours). */
    private function annonceur(RadarAdvertiserNature $nature, int $annonces = 1): RadarAdvertiser
    {
        $numero = '+22174'.str_pad((string) ++$this->numero, 7, '0', STR_PAD_LEFT);
        $annonceur = RadarAdvertiser::query()->create([
            'phone' => $numero,
            'phone_hmac' => RadarPhone::hmac($numero),
            'display_name' => 'Annonceur fictif '.$this->numero,
            'nature' => $nature,
        ]);
        RadarListing::factory()->count($annonces)->create(['radar_advertiser_id' => $annonceur->id]);

        return $annonceur;
    }

    /** @return array<string, mixed> */
    private function historique(?string $depuis = null, ?string $jusque = null): array
    {
        return app(RadarObservatory::class)->compute(['nature_history'], [
            'since' => $depuis === null ? null : now()->parse($depuis)->startOfDay(),
            'until' => $jusque === null ? null : now()->parse($jusque)->startOfDay(),
        ])['nature_history'];
    }

    /** Deux intermédiaires (3 annonces) et un propriétaire (1 annonce), comptés trois jours de suite. */
    private function compterTroisJours(): void
    {
        $this->annonceur(RadarAdvertiserNature::ProbableIntermediary, 2);
        $this->annonceur(RadarAdvertiserNature::ProbableIntermediary);
        $this->annonceur(RadarAdvertiserNature::ProbableOwner);

        foreach (['2026-10-01', '2026-10-02', '2026-10-03'] as $jour) {
            $this->travelTo($jour.' 04:13:00');
            $this->artisan('radar:count-natures')->assertSuccessful();
        }
    }

    /**
     * AC1 — la part par nature d'une période passée est la même avant et après la purge. Horloge figée ; la purge à échéance
     * efface les annonces et remet la nature des annonceurs à `unknown` : la lecture vivante change, l'historique non.
     */
    public function test_la_part_par_nature_d_une_periode_passee_survit_a_la_purge(): void
    {
        $this->compterTroisJours();
        $avant = $this->historique('2026-10-01', '2026-10-03');
        $vivantAvant = app(RadarObservatory::class)->compute(['natures'], [])['natures'];

        $this->assertSame(['probable_owner' => 3, 'probable_intermediary' => 6, 'agency' => 0, 'unknown' => 0], $avant['advertisers']);
        $this->assertSame(['probable_owner' => 3, 'probable_intermediary' => 9, 'agency' => 0, 'unknown' => 0], $avant['listings']);
        $this->assertSame(3, $avant['days']);
        $this->assertSame(['probable_owner' => 1, 'probable_intermediary' => 2, 'agency' => 0, 'unknown' => 0], $vivantAvant);

        // 90 jours plus tard : la purge planifiée efface tout, puis un jour encore est compté sur le marché vidé.
        $this->travelTo('2027-01-05 04:15:00');
        $this->artisan('radar:purge')->assertSuccessful();
        $this->assertSame(4, RadarListing::query()->where('stage', RadarListingStage::Purged)->count());
        $this->travelTo('2027-01-06 04:13:00');
        $this->artisan('radar:count-natures')->assertSuccessful();

        $this->assertSame($avant, $this->historique('2026-10-01', '2026-10-03'));
        // La lecture vivante, elle, a tout perdu : c'est ce que le compteur existe pour tenir.
        $this->assertSame(['probable_owner' => 0, 'probable_intermediary' => 0, 'agency' => 0, 'unknown' => 0], app(RadarObservatory::class)->compute(['natures'], [])['natures']);
    }

    /** Le compteur du jour s'écrit AVANT la purge : `radar:purge` le pose lui-même si le passage planifié a manqué. */
    public function test_la_purge_compte_le_jour_avant_d_effacer(): void
    {
        $this->annonceur(RadarAdvertiserNature::Agency, 2);

        $this->travelTo('2027-01-05 04:15:00');
        $this->artisan('radar:purge')->assertSuccessful();

        $this->assertSame(1, RadarNatureCount::query()->whereDate('day', '2027-01-05')->where('nature', 'agency')->value('advertisers'));
        $this->assertSame(2, RadarNatureCount::query()->whereDate('day', '2027-01-05')->where('nature', 'agency')->value('listings'));
        $this->assertSame(2, RadarListing::query()->where('stage', RadarListingStage::Purged)->count());
    }

    /**
     * Éteint par défaut : ni la commande ni la purge n'écrivent une ligne, et l'observatoire dit que le comptage est éteint.
     * La différence entre deux jours, avec la date du STOP gardée, rend la nature d'un annonceur qui a dit STOP : le porteur
     * ne l'allume qu'après l'avis juridique de TCK-2434.
     */
    public function test_eteint_par_defaut_rien_ne_s_ecrit(): void
    {
        // Le défaut du fichier de configuration, variable d'environnement ABSENTE (un `.env` qui la déclare ne prouve rien).
        $sauve = [$_ENV['RADAR_NATURE_COUNTS'] ?? null, $_SERVER['RADAR_NATURE_COUNTS'] ?? null, getenv('RADAR_NATURE_COUNTS')];
        unset($_ENV['RADAR_NATURE_COUNTS'], $_SERVER['RADAR_NATURE_COUNTS']);
        putenv('RADAR_NATURE_COUNTS');
        try {
            $defaut = (require config_path('radar.php'))['nature_counts']['enabled'];
        } finally {
            [$env, $server, $getenv] = $sauve;
            if ($env !== null) {
                $_ENV['RADAR_NATURE_COUNTS'] = $env;
            }
            if ($server !== null) {
                $_SERVER['RADAR_NATURE_COUNTS'] = $server;
            }
            if ($getenv !== false) {
                putenv('RADAR_NATURE_COUNTS='.$getenv);
            }
        }
        $this->assertFalse($defaut);
        config(['radar.nature_counts.enabled' => $defaut]);
        $this->annonceur(RadarAdvertiserNature::ProbableIntermediary, 2);

        $this->artisan('radar:count-natures')->assertSuccessful();
        $this->travelTo('2027-01-05 04:15:00');
        $this->artisan('radar:purge')->assertSuccessful();

        $this->assertSame(0, RadarNatureCount::query()->count());
        $this->assertSame(2, RadarListing::query()->where('stage', RadarListingStage::Purged)->count());
        $this->assertFalse($this->historique()['enabled']);
        config(['radar.nature_counts.enabled' => true]);
        $this->assertTrue($this->historique()['enabled']);
    }

    /**
     * Une panne du compteur ne fait jamais tomber la purge légale : elle est signalée, puis la purge efface. La panne est réelle
     * (table absente, comme après un déploiement partiel) : une erreur SQL, qui sans point de sauvegarde abandonnerait aussi la
     * transaction englobante.
     */
    public function test_une_panne_du_compteur_ne_bloque_pas_la_purge(): void
    {
        Exceptions::fake();
        $this->annonceur(RadarAdvertiserNature::Agency, 2);
        Schema::drop('radar_nature_counts');

        $this->travelTo('2027-01-05 04:15:00');
        $this->artisan('radar:purge')->assertSuccessful();

        $this->assertSame(2, RadarListing::query()->where('stage', RadarListingStage::Purged)->count());
        Exceptions::assertReported(fn (QueryException $e) => str_contains($e->getMessage(), 'radar_nature_counts'));
    }

    /** Le planificateur compte avant de purger, à l'heure de Dakar, sans chevauchement. */
    public function test_le_planificateur_compte_avant_la_purge(): void
    {
        $evenements = collect(app(Schedule::class)->events());
        $compte = $evenements->first(fn ($e) => str_contains((string) $e->command, 'radar:count-natures'));
        $purge = $evenements->first(fn ($e) => str_contains((string) $e->command, 'radar:purge'));

        $this->assertNotNull($compte);
        $this->assertSame('Africa/Dakar', $compte->timezone);
        $this->assertSame($purge->timezone, $compte->timezone);
        $this->assertTrue($compte->withoutOverlapping);
        [$minuteCompte, $heureCompte] = explode(' ', $compte->expression);
        [$minutePurge, $heurePurge] = explode(' ', $purge->expression);
        $this->assertLessThan((int) $heurePurge * 60 + (int) $minutePurge, (int) $heureCompte * 60 + (int) $minuteCompte);
    }

    /** Idempotent : une écriture rejouée le même jour ne double rien et garde le premier compte (celui d'avant la purge). */
    public function test_une_ecriture_rejouee_le_meme_jour_ne_change_rien(): void
    {
        $this->annonceur(RadarAdvertiserNature::ProbableIntermediary);

        $this->assertSame(4, app(RadarNatureCounter::class)->record());
        $this->annonceur(RadarAdvertiserNature::ProbableIntermediary, 3);
        $this->assertSame(0, app(RadarNatureCounter::class)->record());

        $this->assertSame(4, RadarNatureCount::query()->count());
        $this->assertSame([1, 1], RadarNatureCount::query()->where('nature', 'probable_intermediary')->get(['advertisers', 'listings'])
            ->map(fn ($c) => [$c->advertisers, $c->listings])->sole());
    }

    /** Le périmètre est celui de la lecture vivante : doublons et annonces purgées exclus ; toutes les natures, zéro compris. */
    public function test_le_compte_suit_la_lecture_vivante(): void
    {
        $intermediaire = $this->annonceur(RadarAdvertiserNature::ProbableIntermediary);
        $original = RadarListing::query()->where('radar_advertiser_id', $intermediaire->id)->sole();
        RadarListing::factory()->create(['radar_advertiser_id' => $intermediaire->id, 'stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $original->id]);
        $purge = $this->annonceur(RadarAdvertiserNature::Agency);
        RadarListing::query()->where('radar_advertiser_id', $purge->id)->update(['stage' => RadarListingStage::Purged->value]);
        RadarListing::factory()->create(); // sans annonceur : aucune nature à compter

        app(RadarNatureCounter::class)->record();

        $comptes = RadarNatureCount::query()->orderBy('nature')->get()->mapWithKeys(fn ($c) => [$c->nature->value => [$c->advertisers, $c->listings]])->all();
        $this->assertSame(['agency' => [0, 0], 'probable_intermediary' => [1, 1], 'probable_owner' => [0, 0], 'unknown' => [0, 0]], $comptes);
        // La section vivante `natures` et le compteur partagent la même définition.
        $vivant = app(RadarObservatory::class)->compute(['natures'], [])['natures'];
        $this->assertSame($vivant, array_map(fn (string $nature) => $comptes[$nature][0], array_combine(array_keys($vivant), array_keys($vivant))));
    }

    /**
     * Anonyme par construction : le jour, la nature, deux nombres. Aucune colonne d'identifiant, de lieu, de prix, de site ni
     * d'instant plus fin que le jour. Une colonne de plus ici est une décision à prendre avec TCK-2434, pas un ajout.
     */
    public function test_la_table_ne_porte_que_le_jour_la_nature_et_deux_nombres(): void
    {
        $this->assertSame(['advertisers', 'day', 'id', 'listings', 'nature'], collect(Schema::getColumnListing('radar_nature_counts'))->sort()->values()->all());
    }

    /** La période : `since` et `until` bornent les jours lus ; sans compteur, des zéros et aucun jour. */
    public function test_la_periode_borne_les_jours_lus(): void
    {
        $vide = $this->historique();
        $this->assertSame(['days' => 0, 'first_day' => null, 'last_day' => null], array_intersect_key($vide, array_flip(['days', 'first_day', 'last_day'])));
        $this->assertSame(0, array_sum($vide['advertisers']));

        $this->compterTroisJours();

        $this->assertSame(['days' => 2, 'first_day' => '2026-10-02', 'last_day' => '2026-10-03'], array_intersect_key($this->historique('2026-10-02'), array_flip(['days', 'first_day', 'last_day'])));
        $this->assertSame(['days' => 1, 'first_day' => '2026-10-01', 'last_day' => '2026-10-01'], array_intersect_key($this->historique(null, '2026-10-01'), array_flip(['days', 'first_day', 'last_day'])));
        $this->assertSame(2, $this->historique('2026-10-02', '2026-10-02')['advertisers']['probable_intermediary']);
    }

    /** La route sert la section par `fields[radar_observatory]`, bornée par `filter[since|until]` ; une période à l'envers est refusée. */
    public function test_la_route_sert_l_historique_par_nature(): void
    {
        $this->compterTroisJours();
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $reponse = $this->getJson('/api/admin/radar/observatory?fields[radar_observatory]=nature_history&filter[since]=2026-10-02&filter[until]=2026-10-03')->assertOk();

        $this->assertSame(['nature_history'], array_keys($reponse->json('data')));
        $this->assertSame(2, $reponse->json('data.nature_history.days'));
        $this->assertSame(4, $reponse->json('data.nature_history.advertisers.probable_intermediary'));
        $this->getJson('/api/admin/radar/observatory?fields[radar_observatory]=nature_history&filter[since]=2026-10-03&filter[until]=2026-10-01')->assertUnprocessable();
    }
}
