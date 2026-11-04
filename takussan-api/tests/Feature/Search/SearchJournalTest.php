<?php

namespace Tests\Feature\Search;

use App\Models\SearchQueryStat;
use App\Services\Search\SearchJournal;
use App\Support\AppKeyHmac;
use App\Support\VisitorFingerprint;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-2472 (ADR-0088) — le journal anonyme et agrégé des recherches : agrégation par jour, visiteur distinct au jour,
 * ce qui n'est jamais journalisé, le seuil des cinq visiteurs, la popularité filtrée par résultats, la purge.
 */
class SearchJournalTest extends TestCase
{
    use RefreshDatabase;

    private const NAVIGATEUR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

    private SearchJournal $journal;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->utc()->setTime(12, 0));
        $this->journal = app(SearchJournal::class);
    }

    public function test_une_recherche_ecrit_une_ligne_par_jour_et_par_recherche(): void
    {
        $this->journal->record($this->visiteur('198.51.100.1'), '  Appart   MÉDINA ', ['contract_type' => 'rent'], 12);
        $this->journal->record($this->visiteur('198.51.100.2'), 'appart medina', ['contract_type' => 'rent'], 0);

        $ligne = SearchQueryStat::query()->sole();
        $this->assertSame('appart medina', $ligne->normalized_query, 'minuscules, sans accents, blancs repliés');
        $this->assertSame(['contract_type' => 'rent'], $ligne->criteria);
        $this->assertSame(now()->toDateString(), $ligne->day->toDateString());
        $this->assertSame(2, $ligne->searches_count);
        $this->assertSame(2, $ligne->distinct_visitors);
        $this->assertSame(1, $ligne->zero_results_count);
        $this->assertSame(0, $ligne->last_results_count, 'le DERNIER nombre de résultats');
        $this->assertSame(64, strlen($ligne->query_key));
    }

    public function test_d_autres_criteres_font_une_autre_ligne_mais_ni_l_ordre_ni_la_casse(): void
    {
        $this->journal->record($this->visiteur('198.51.100.1'), 'villa', ['city' => 'Dakar', 'type' => 'villa,house'], 3);
        $this->journal->record($this->visiteur('198.51.100.1'), 'villa', ['type' => 'house,villa', 'city' => 'dakar '], 3);
        $this->assertSame(1, SearchQueryStat::query()->count(), 'même recherche : ordre des clés, des valeurs et casse');

        $this->journal->record($this->visiteur('198.51.100.1'), 'villa', ['city' => 'Thiès'], 3);
        $this->assertSame(2, SearchQueryStat::query()->count());
    }

    public function test_le_meme_visiteur_ne_compte_qu_une_fois_par_jour(): void
    {
        foreach (range(1, 3) as $_) {
            $this->journal->record($this->visiteur('198.51.100.7'), 'terrain', [], 4);
        }
        // Le même /64 d'une IPv6 est le même visiteur (`VisitorFingerprint::network`).
        $this->journal->record($this->visiteur('2001:db8:1:2::1'), 'terrain', [], 4);
        $this->journal->record($this->visiteur('2001:db8:1:2:ffff::9'), 'terrain', [], 4);

        $ligne = SearchQueryStat::query()->sole();
        $this->assertSame(5, $ligne->searches_count);
        $this->assertSame(2, $ligne->distinct_visitors);

        // Le lendemain, l'empreinte change : une autre ligne, un nouveau visiteur.
        $this->travel(1)->days();
        $this->journal->record($this->visiteur('198.51.100.7'), 'terrain', [], 4);
        $this->assertSame([2, 1], SearchQueryStat::query()->orderBy('day')->pluck('distinct_visitors')->all());
    }

    public function test_l_empreinte_est_un_hmac_du_jour_et_de_la_recherche_et_aucune_ip_n_est_ecrite(): void
    {
        $this->journal->record($this->visiteur('198.51.100.9'), 'studio', [], 1);

        $cle = SearchQueryStat::query()->sole()->query_key;
        $empreintes = DB::table('search_query_visitors')->pluck('visitor_hash')->all();
        $attendue = AppKeyHmac::of(now()->toDateString().'|'.$cle.'|'.VisitorFingerprint::network('198.51.100.9'));
        // Deux lignes : l'empreinte du visiteur (le compte), et celle de son réseau /24 (le seuil, revue adverse n° 8).
        $this->assertEqualsCanonicalizing([$attendue, AppKeyHmac::of('reseau|'.now()->toDateString().'|'.$cle.'|198.51.100.0/24')], $empreintes);
        $this->assertSame($attendue, SearchJournal::visitorHash('198.51.100.9', now()->toDateString(), $cle));
        $this->assertNotContains(VisitorFingerprint::ofIp('198.51.100.9'), $empreintes, 'pas l’empreinte durable des signalements');
        $this->travel(1)->days();
        $this->assertNotSame($attendue, SearchJournal::visitorHash('198.51.100.9', now()->toDateString(), $cle), 'une autre chaque jour');

        $tout = json_encode([DB::table('search_query_visitors')->get(), DB::table('search_query_stats')->get()]);
        $this->assertStringNotContainsString('198.51.100.9', (string) $tout);
    }

    /** AC1 — une saisie qui porte un numéro de téléphone n'écrit aucune ligne, ni dans le journal, ni dans la table de travail. */
    public function test_une_saisie_avec_un_numero_n_ecrit_aucune_ligne(): void
    {
        $this->journal->record($this->visiteur('198.51.100.1'), 'appart 77 123 45 67', [], 3);

        $this->assertSame(0, DB::table('search_query_stats')->count());
        $this->assertSame(0, DB::table('search_query_visitors')->count());
    }

    public function test_ce_qui_n_est_jamais_journalise(): void
    {
        foreach ([
            'six chiffres' => '123456',
            'chiffres épars' => 'f4 1 2 3 4 5',
            'chiffres arabes-indiens' => 'شقة ٧٧١٢٣٤',
            'courriel' => 'moussa@exemple.sn',
            'arobase pleine chasse' => 'moussa＠exemple',
            '81 caractères' => str_repeat('a', 81),
        ] as $cas => $saisie) {
            $this->journal->record($this->visiteur('198.51.100.1'), $saisie, [], 3);
            $this->assertSame(0, SearchQueryStat::query()->count(), $cas);
        }

        // Un critère libre est une saisie comme une autre.
        $this->journal->record($this->visiteur('198.51.100.1'), 'villa', ['location' => 'chez 77 123 45 67'], 3);
        $this->journal->record($this->visiteur('198.51.100.1'), null, ['cities' => ['Dakar', 'awa@exemple.sn']], 3);
        $this->assertSame(0, SearchQueryStat::query()->count(), 'critère libre');

        // Témoins : cinq chiffres et 80 caractères passent.
        $this->journal->record($this->visiteur('198.51.100.1'), 'villa 12345', [], 3);
        $this->journal->record($this->visiteur('198.51.100.1'), str_repeat('b', 80), [], 3);
        $this->assertSame(2, SearchQueryStat::query()->count(), 'témoins');
    }

    /**
     * Revue adverse n° 1 (2026-11-04) — une adresse électronique écrite SANS arobase (« awa.diop gmail.com », « awa diop
     * at gmail point com ») était journalisée, puis envoyée au modèle de `search.variantes` dès deux visiteurs. Un
     * numéro écrit avec des points ou des tirets compte ses chiffres comme un autre.
     */
    public function test_un_courriel_sans_arobase_ou_un_numero_ponctue_n_est_jamais_journalise(): void
    {
        foreach ([
            'awa.diop gmail.com', 'awa diop at gmail point com', 'awa.diop(at)gmail.com', 'awa diop [at] yahoo fr',
            'moussa hotmail', 'contact outlook', 'awa dot diop gmail dot com', 'moussa.ndiaye arobase orange',
            'fatou icloud', 'agence.dakar.sn', 'ndiaye point com', 'moussa ymail',
            '77.123.45.67', '77-123-45-67', '+221 77 12', '33 8 20 1',
        ] as $saisie) {
            $this->journal->record($this->visiteur('198.51.100.1'), $saisie, [], 0);
            $this->assertFalse(SearchJournal::isJournalisable($saisie), $saisie);
            $this->assertSame(0, SearchQueryStat::query()->count(), $saisie);
        }
        $this->journal->record($this->visiteur('198.51.100.1'), 'villa', ['location' => 'awa diop gmail'], 3);
        $this->assertSame(0, SearchQueryStat::query()->count(), 'critère libre');

        // Témoins : un mot de liaison anglais, un quartier qui commence par « Point », un mot qui contient un fournisseur.
        foreach (['apartment at almadies', 'villa point e', 'studio a louer mermoz', 'maison 3 chambres', 'appartement liveable'] as $temoin) {
            $this->assertTrue(SearchJournal::isJournalisable($temoin), $temoin);
        }
    }

    /**
     * Revue adverse n° 7 — l'empreinte du visiteur est propre à la RECHERCHE : trois recherches d'une même adresse le même
     * jour ne partagent aucune empreinte, donc la table de travail ne relie pas l'historique d'un visiteur.
     */
    public function test_les_recherches_d_un_meme_visiteur_ne_se_relient_pas_entre_elles(): void
    {
        $this->journal->record($this->visiteur('198.51.100.7'), 'villa almadies', [], 3);
        $this->journal->record($this->visiteur('198.51.100.7'), 'maison ouakam', [], 3);
        $this->journal->record($this->visiteur('198.51.100.7'), 'terrain', ['city' => 'Dakar'], 3);

        $lignes = DB::table('search_query_visitors')->get(['query_key', 'visitor_hash']);
        $this->assertCount(3, $lignes->pluck('query_key')->unique());
        $this->assertSame($lignes->count(), $lignes->pluck('visitor_hash')->unique()->count(), 'aucune empreinte partagée entre deux recherches');
        $this->assertSame([1, 1, 1], SearchQueryStat::query()->pluck('distinct_visitors')->all());
    }

    /**
     * Revue adverse n° 8 — le SEUIL d'affichage compte les réseaux (/48 en IPv6, /24 en IPv4) : cinq adresses d'un même
     * /48 (une seule box, un seul hébergeur) ne font pas une recherche populaire, montrée à tous. Le compte des visiteurs,
     * lui, reste au /64 et à l'adresse IPv4 (ADR-0088 §2, amendement du 2026-11-04).
     */
    public function test_un_seul_reseau_ne_fait_pas_cinq_visiteurs_pour_le_seuil(): void
    {
        foreach (range(1, 5) as $i) {
            $this->journal->record($this->visiteur(sprintf('2001:db8:42:%x::1', $i)), 'agence xyz meilleure', [], 4);
            $this->journal->record($this->visiteur('198.51.100.'.$i), 'villa ngor', [], 4);
        }
        $this->assertSame([5, 5], SearchQueryStat::query()->orderBy('normalized_query')->pluck('distinct_visitors')->all(), 'le compte, au /64 et à l’adresse');
        $this->assertSame([], $this->journal->popular('', 10), 'un /48 et un /24 : un seul réseau chacun');

        foreach (range(1, 4) as $i) {
            $this->journal->record($this->visiteur(sprintf('2001:db8:%x::1', 0x100 + $i)), 'agence xyz meilleure', [], 4);
        }
        $this->assertSame([['text' => 'agence xyz meilleure', 'criteria' => [], 'count' => 9]], $this->journal->popular('', 10), 'cinq réseaux');
    }

    public function test_une_recherche_vide_ou_d_un_robot_n_ecrit_rien(): void
    {
        $this->journal->record($this->visiteur('198.51.100.1'), '   ', [], 40);
        $this->journal->record($this->visiteur('198.51.100.1'), null, ['sort' => 'price_asc', 'lat' => 14.7, 'lng' => -17.4, 'radius_km' => 2], 40);
        $this->assertSame(0, SearchQueryStat::query()->count(), 'ni saisie ni critère retenu');

        $this->journal->record($this->visiteur('198.51.100.1', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), 'villa', [], 4);
        $this->assertSame(0, SearchQueryStat::query()->count(), 'robot');

        $this->journal->record($this->visiteur('198.51.100.1'), null, ['contract_type' => 'sale', 'lat' => 14.7, 'lng' => -17.4], 4);
        $this->assertSame([['contract_type' => 'sale']], SearchQueryStat::query()->pluck('criteria')->all(), 'les coordonnées ne sont jamais écrites');
        $this->assertNull(SearchQueryStat::query()->value('normalized_query'));
    }

    public function test_une_panne_est_avalee_et_rapportee(): void
    {
        Exceptions::fake();
        Schema::drop('search_query_visitors');

        $this->journal->record($this->visiteur('198.51.100.1'), 'villa', [], 4);

        Exceptions::assertReported(fn (QueryException $e) => str_contains($e->getMessage(), 'search_query_visitors'));
        $this->assertSame(0, SearchQueryStat::query()->count(), 'rien d’écrit à moitié');
    }

    /** AC2 — 4 visiteurs distincts le même jour : `popular('')` ne rend pas la saisie ; 5 : il la rend. */
    public function test_une_recherche_n_est_proposee_qu_apres_cinq_visiteurs_distincts_un_meme_jour(): void
    {
        $this->visiteurs(4, 'appart almadies', ['contract_type' => 'rent'], 6);
        $this->assertSame([], $this->journal->popular('', 6));

        $this->journal->record($this->visiteur('203.0.113.250'), 'appart almadies', ['contract_type' => 'rent'], 6);
        $this->assertSame(
            [['text' => 'appart almadies', 'criteria' => ['contract_type' => 'rent'], 'count' => 5]],
            $this->journal->popular('', 6),
        );
    }

    public function test_quatre_visiteurs_sur_deux_jours_ne_suffisent_pas(): void
    {
        $this->visiteurs(4, 'villa saly', [], 2);
        $this->travel(1)->days();
        $this->visiteurs(4, 'villa saly', [], 2, 'b');

        $this->assertSame([], $this->journal->popular('', 6), 'le seuil se juge un même jour');
    }

    public function test_la_popularite_est_filtree_par_resultats_par_prefixe_et_par_fenetre(): void
    {
        $this->visiteurs(6, 'appart ouakam', [], 3);
        $this->visiteurs(5, 'appartement mermoz', [], 1);
        $this->visiteurs(7, 'appart ngor', [], 0);
        $this->visiteurs(5, null, ['type' => 'villa', 'contract_type' => 'sale'], 9);

        $this->assertSame(
            ['appart ouakam', 'appartement mermoz', ''],
            array_column($this->journal->popular('', 6), 'text'),
            'sans résultat : jamais montrée ; tri par visiteurs',
        );
        $this->assertSame(['appart ouakam', 'appartement mermoz'], array_column($this->journal->popular('  APPART', 6), 'text'));
        $this->assertSame(['appartement mermoz'], array_column($this->journal->popular('appartE', 6), 'text'));
        $this->assertSame(['appart ouakam'], array_column($this->journal->popular('', 1), 'text'), 'la limite');
        $this->assertSame([], $this->journal->popular('%', 6), 'un joker n’est pas un joker');

        // Le dernier nombre de résultats fait foi : une recherche qui ne rend plus rien sort.
        $this->journal->record($this->visiteur('203.0.113.200'), 'appart ouakam', [], 0);
        $this->assertSame(['appartement mermoz', ''], array_column($this->journal->popular('', 6), 'text'));

        // Hors des 30 jours : plus proposée.
        $this->travel(30)->days();
        $this->assertSame([], $this->journal->popular('', 6));
    }

    public function test_la_popularite_cumule_les_jours_de_la_fenetre(): void
    {
        $this->visiteurs(5, 'maison keur massar', [], 2);
        $this->travel(1)->days();
        $this->visiteurs(2, 'maison keur massar', [], 3, 'b');

        $this->assertSame(
            [['text' => 'maison keur massar', 'criteria' => [], 'count' => 7]],
            $this->journal->popular('', 6),
        );
    }

    public function test_la_demande_sans_resultat(): void
    {
        $this->visiteurs(3, 'villa piscine yoff', ['contract_type' => 'rent'], 0);
        $this->visiteurs(1, null, ['type' => 'land', 'city' => 'Kolda'], 0);
        $this->travel(1)->days();
        $this->visiteurs(2, 'villa piscine yoff', ['contract_type' => 'rent'], 0, 'b');
        $this->visiteurs(4, 'studio plateau', [], 0);
        $this->journal->record($this->visiteur('203.0.113.201'), 'studio plateau', [], 2);
        $this->visiteurs(2, 'duplex', [], 5);

        $this->assertSame([
            ['criteria' => ['contract_type' => 'rent'], 'normalized_query' => 'villa piscine yoff', 'distinct_visitors' => 5],
            ['criteria' => ['city' => 'Kolda', 'type' => 'land'], 'normalized_query' => null, 'distinct_visitors' => 1],
        ], $this->journal->zeroResultDemand(30), 'trouvée depuis : elle sort ; jamais vide : elle n’entre pas');

        $this->assertCount(1, $this->journal->zeroResultDemand(30, minVisitors: 2));
        $this->assertCount(1, $this->journal->zeroResultDemand(30, limit: 1));

        $this->travel(1)->days();
        $this->assertSame(['villa piscine yoff'], array_column($this->journal->zeroResultDemand(2), 'normalized_query'), 'la fenêtre');
    }

    /**
     * AC3 — une empreinte de visiteur de plus de 48 h est effacée par la purge. La purge est horaire et efface dès 47 h :
     * aucune n'atteint 48 h. Une ligne du journal vit 13 mois.
     */
    public function test_la_purge_efface_les_empreintes_avant_48_heures_et_les_lignes_de_plus_de_13_mois(): void
    {
        $this->journal->record($this->visiteur('198.51.100.1'), 'villa', [], 4);
        $this->travel(13)->months();
        $this->travel(1)->days();
        $debut = now()->toImmutable();
        $this->journal->record($this->visiteur('198.51.100.1'), 'terrain', [], 4);
        $this->travelTo($debut->addHours(1)->addMinutes(59));
        $this->journal->record($this->visiteur('198.51.100.1'), 'appart', [], 4);
        $this->travelTo($debut->addHours(2)->addMinute());
        $this->journal->record($this->visiteur('198.51.100.1'), 'studio', [], 4);
        $this->travelTo($debut->addHours(49));

        $this->assertSame(0, Artisan::call('search:purge-journal'));

        $this->assertSame(
            ['studio'],
            DB::table('search_query_visitors')
                ->join('search_query_stats', 'search_query_stats.query_key', '=', 'search_query_visitors.query_key')
                ->distinct()->pluck('normalized_query')->all(),
            '49 h : effacée ; 47 h 01 : effacée ; 46 h 59 : gardée ; 13 mois : effacée',
        );
        $this->assertEqualsCanonicalizing(['terrain', 'appart', 'studio'], SearchQueryStat::query()->pluck('normalized_query')->all(), 'la ligne de 13 mois et quelques jours part');

        $this->assertSame(0, Artisan::call('search:purge-journal'), 'idempotente');
        $this->assertSame(3, SearchQueryStat::query()->count());
        $this->assertSame(2, DB::table('search_query_visitors')->count(), 'l’empreinte du visiteur et celle de son réseau');
    }

    public function test_la_purge_est_planifiee_toutes_les_heures(): void
    {
        $evenement = collect(app(Schedule::class)->events())
            ->first(fn ($e) => str_contains((string) $e->command, 'search:purge-journal'));

        $this->assertNotNull($evenement, 'planifiée dans routes/console.php');
        $this->assertSame('0 * * * *', $evenement->expression, 'horaire : sinon une empreinte vit jusqu’à 71 h');
    }

    private function visiteur(string $ip, string $agent = self::NAVIGATEUR): Request
    {
        return Request::create('/api/public/properties/search', 'GET', server: ['REMOTE_ADDR' => $ip, 'HTTP_USER_AGENT' => $agent]);
    }

    /** @param  array<string, mixed>  $criteria */
    private function visiteurs(int $n, ?string $q, array $criteria, int $total, string $serie = 'a'): void
    {
        foreach (range(1, $n) as $i) {
            // Un /48 par visiteur : le seuil d'affichage compte les réseaux (revue adverse n° 8) ; la série change le /64.
            $this->journal->record($this->visiteur(sprintf('2001:db8:%x:%s::1', $i, $serie === 'a' ? 'aa' : 'bb')), $q, $criteria, $total);
        }
    }
}
