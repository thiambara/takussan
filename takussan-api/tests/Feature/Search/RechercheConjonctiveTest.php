<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Services\Search\PropertySearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-338 / ADR-0020 — une recherche à plusieurs mots les EXIGE tous, et le
 * repli nomme ce qu'il a dû relâcher.
 *
 * ── CE QUE CES TESTS DOIVENT DISTINGUER ───────────────────────────────────
 *
 * Les deux critères d'acceptation d'origine du ticket — « `villa Saly` rend 0 »
 * et « `villa à louer à Dakar` rend un compte non nul inférieur à `villa` » —
 * sont cochés À L'IDENTIQUE par une régression : un post-filtrage de la PAGE
 * côté PHP (ne garder que les hits portant tous les termes) rend bien 0 sur la
 * première, et bien « non nul, inférieur » sur la seconde. Il rend aussi un
 * `meta.total` plafonné à `per_page` et une pagination morte — sans que rien
 * ne le dise.
 *
 * Chaque test ci-dessous porte donc au moins une assertion qu'un post-filtrage
 * de page NE PEUT PAS produire :
 *
 *  - un `meta.total` STRICTEMENT SUPÉRIEUR à `per_page`, avec une deuxième
 *    page qui rend réellement le reste ({@see test_le_total_conjonctif_est_celui_du_moteur_pas_dune_page}) ;
 *  - l'ÉGALITÉ d'ensemble avec le filtre structuré équivalent, ids compris
 *    ({@see test_le_compte_conjonctif_coincide_avec_le_filtre_structure}) ;
 *  - le bloc `search`, qu'aucun filtrage de page ne peut renseigner, et dont
 *    chaque terme nommé est PROUVÉ par une sonde solo rejouée dans le test
 *    lui-même.
 *
 * ── ABLATIONS ─────────────────────────────────────────────────────────────
 *
 * Chaque test nomme, dans son corps, la ligne dont le retrait le fait rougir.
 * Les deux ablations — `'matchingStrategy' => self::STRATEGY_STRICT` et le bloc
 * de repli de `PropertySearchService::search()` — ont été jouées.
 */
class RechercheConjonctiveTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var array<string,Property> */
    private array $biens = [];

    private function service(): PropertySearchService
    {
        return app(PropertySearchService::class);
    }

    /**
     * Le corpus reproduit EN PETIT la mesure fondatrice de l'audit.
     *
     * Quatre villas — trois à Dakar, une à Saly — et un studio à Ngor. Aucun
     * bien à Mbour : c'est le terme qui ne correspond à rien.
     *
     * ⚠ Les TITRES sont muets, comme dans {@see PropertySearchVocabularyTest} :
     * aucun ne porte « villa », « studio », ni un nom de ville. Le mot « villa »
     * atteint l'index par `type_label` et le nom de ville par l'adresse — pas
     * par la chance d'un gabarit. Un titre bavard rendrait ces tests verts sans
     * qu'aucune des deux voies fonctionne.
     *
     * ⚠⚠ Les descriptions sont ÉCRITES, jamais tirées par la factory : le
     * `fake()->paragraphs()` du défaut produit du texte dont on ne contrôle pas
     * les jetons, et un « Mbour » de hasard suffirait à rendre le test du repli
     * ininterprétable.
     */
    private function semerLeCorpus(): void
    {
        $this->biens['villa_dakar_1'] = $this->publier(
            ['title' => 'Grande demeure avec jardin', 'description' => 'Vue dégagée, calme.'],
            PropertyType::Villa, 'Dakar', 'Almadies',
        );
        $this->biens['villa_dakar_2'] = $this->publier(
            ['title' => 'Demeure familiale', 'description' => 'Garage double et cour.'],
            PropertyType::Villa, 'Dakar', 'Almadies',
        );
        $this->biens['villa_dakar_3'] = $this->publier(
            ['title' => 'Demeure de standing', 'description' => 'Cuisine équipée, buanderie.'],
            PropertyType::Villa, 'Dakar', 'Almadies',
        );
        $this->biens['villa_saly'] = $this->publier(
            ['title' => 'Demeure balnéaire', 'description' => 'À deux pas du rivage.'],
            PropertyType::Villa, 'Saly', 'Centre',
        );
        $this->biens['studio_ngor'] = $this->publier(
            ['title' => 'Petit logement lumineux', 'description' => 'Immeuble récent.'],
            PropertyType::Studio, 'Dakar', 'Ngor',
        );
    }

    /** @param array<string,mixed> $attributs */
    private function publier(array $attributs, PropertyType $type, string $ville, string $quartier): Property
    {
        $bien = Property::factory()->published()->create([
            ...$attributs,
            'type' => $type,
            'contract_type' => ContractType::Rent,
        ]);

        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => $ville,
            'neighborhood' => $quartier,
        ]);

        return $bien;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. Le défaut de tête
    // ─────────────────────────────────────────────────────────────────────

    /**
     * La mesure fondatrice de l'audit, reproduite : deux mots RESTREIGNENT là
     * où un seul élargissait.
     *
     * C'est l'objectif utilisateur du ticket, mot pour mot — « un visiteur qui
     * cherche *villa Saly* ne reçoit pas des villas de Dakar ».
     *
     * ABLATION — retirer `'matchingStrategy' => 'all'` : `q=villa Saly` rend
     * alors les 4 mêmes villas que `q=villa`, dont les trois de Dakar, et les
     * trois assertions d'ensemble rougissent.
     */
    public function test_deux_mots_restreignent_la_ou_un_seul_elargissait(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $villa = $this->service()->search(['q' => 'villa']);
        $this->assertSame(4, $villa['meta']['total']);
        $this->assertSame(
            $this->idsAttendus('villa_dakar_1', 'villa_dakar_2', 'villa_dakar_3', 'villa_saly'),
            $this->idsRendus($villa),
        );

        // Sous le défaut `last` de Meilisearch, ces deux requêtes rendaient les
        // 4 MÊMES ids, dans le même ordre : le moteur retirait le terme qui ne
        // matchait pas au lieu d'exclure les documents.
        $villaSaly = $this->service()->search(['q' => 'villa Saly']);
        $this->assertSame('all', $villaSaly['search']['strategy']);
        $this->assertSame($this->idsAttendus('villa_saly'), $this->idsRendus($villaSaly));

        $villaDakar = $this->service()->search(['q' => 'villa Dakar']);
        $this->assertSame('all', $villaDakar['search']['strategy']);
        $this->assertSame(
            $this->idsAttendus('villa_dakar_1', 'villa_dakar_2', 'villa_dakar_3'),
            $this->idsRendus($villaDakar),
        );

        // Aucun bien à Mbour : la conjonction est vide. Le repli SERT tout de
        // même les 4 villas — sinon la moitié des requêtes naturelles rendrait
        // une page blanche (30 couples type × ville sur 60, mesuré ; cf.
        // ADR-0020) — mais la réponse ne les présente plus comme exactes.
        //
        // ⚠ C'est la nuance que le front doit rendre visible, et il ne le fait
        // PAS encore : tant que `search.strategy` n'est pas affiché, cette
        // requête-là reste, à l'écran, celle d'avant. Hors périmètre déclaré de
        // TCK-338 — et c'est une dette, pas un détail.
        $villaMbour = $this->service()->search(['q' => 'villa Mbour']);
        $this->assertNotSame('all', $villaMbour['search']['strategy']);
        $this->assertSame(['Mbour'], $villaMbour['search']['terms_unmatched']);
    }

    /**
     * LE critère qu'un post-filtrage de page ne peut pas cocher.
     *
     * `per_page=2` sur une conjonction qui rend 3 biens : le total doit valoir
     * 3 — donc PLUS que la page —, la pagination doit annoncer deux pages, et
     * la seconde doit rendre le troisième bien. Un filtrage appliqué après
     * coup sur une page de 2 hits rendrait `total=2`, `last_page=1`, et une
     * page 2 vide.
     */
    public function test_le_total_conjonctif_est_celui_du_moteur_pas_dune_page(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $page1 = $this->service()->search(['q' => 'villa Dakar', 'per_page' => 2, 'page' => 1]);

        $this->assertSame(3, $page1['meta']['total']);
        $this->assertSame(2, $page1['meta']['per_page']);
        $this->assertSame(2, $page1['meta']['last_page']);
        $this->assertCount(2, $page1['data']);

        $page2 = $this->service()->search(['q' => 'villa Dakar', 'per_page' => 2, 'page' => 2]);

        $this->assertSame(3, $page2['meta']['total']);
        $this->assertSame(2, $page2['meta']['current_page']);
        $this->assertCount(1, $page2['data']);

        // Les deux pages réunies décrivent exactement la conjonction, sans
        // doublon ni trou.
        $reunies = [...$this->idsRendus($page1), ...$this->idsRendus($page2)];
        sort($reunies);
        $this->assertSame(
            $this->idsAttendus('villa_dakar_1', 'villa_dakar_2', 'villa_dakar_3'),
            $reunies,
        );
    }

    /**
     * Deux chemins qui portent le même mot rendent le même ensemble.
     *
     * C'est la mesure qui a tranché la décision (ADR-0020) : sous `all`,
     * écrire la ville dans la barre de recherche rend EXACTEMENT ce que rend
     * le filtre `city=`. Sous `last`, les deux divergeaient — 4 contre 3 — sans
     * que rien ne le signale.
     *
     * ⚠ L'assertion porte sur les IDS, pas seulement sur le compte : deux
     * ensembles de même taille peuvent être disjoints.
     */
    public function test_le_compte_conjonctif_coincide_avec_le_filtre_structure(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $parLeTexte = $this->service()->search(['q' => 'villa Dakar']);
        $parLeFiltre = $this->service()->search(['q' => 'villa', 'city' => 'Dakar']);

        $this->assertSame(3, $parLeFiltre['meta']['total']);
        $this->assertSame($parLeFiltre['meta']['total'], $parLeTexte['meta']['total']);
        $this->assertSame($this->idsRendus($parLeFiltre), $this->idsRendus($parLeTexte));
        $this->assertSame(
            $this->idsAttendus('villa_dakar_1', 'villa_dakar_2', 'villa_dakar_3'),
            $this->idsRendus($parLeTexte),
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Le repli — rien ne l'exerçait jusqu'ici
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Le repli nomme le terme qui ne correspond à rien — et il le SONDE.
     *
     * ABLATION — retirer le bloc de repli de `search()` : `strategy` reste
     * `all`, `terms_unmatched` reste vide, `widened_total` reste `null` et
     * `data` reste vide. Les cinq assertions rougissent.
     */
    public function test_le_repli_nomme_le_terme_qui_ne_correspond_a_rien(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // La sonde est REJOUÉE ici : le test ne se contente pas de croire le
        // service sur parole quand il affirme « aucun bien ne correspond à
        // Mbour ». C'est ce qui distingue une affirmation prouvée d'une case.
        $this->assertSame(0, $this->service()->search(['q' => 'Mbour'])['meta']['total']);
        $this->assertSame(4, $this->service()->search(['q' => 'villa'])['meta']['total']);

        $resultat = $this->service()->search(['q' => 'villa Mbour']);

        $this->assertSame('widened', $resultat['search']['strategy']);
        $this->assertSame(['Mbour'], $resultat['search']['terms_unmatched']);
        $this->assertSame(4, $resultat['search']['widened_total']);

        // Le repli LIVRE les biens — il ne se contente pas d'annoncer qu'il
        // pourrait le faire. Sans cela on remplacerait un mensonge par un
        // cul-de-sac.
        $this->assertSame(4, $resultat['meta']['total']);
        $this->assertSame(
            $this->idsAttendus('villa_dakar_1', 'villa_dakar_2', 'villa_dakar_3', 'villa_saly'),
            $this->idsRendus($resultat),
        );

        // `widened_total` ne peut pas contredire la pagination : il en est
        // l'écho, par construction.
        $this->assertSame($resultat['meta']['total'], $resultat['search']['widened_total']);
    }

    /**
     * Le terme nommé ne dépend PAS de sa position dans la requête.
     *
     * C'est ce qui sépare une sonde d'une devinette. Meilisearch, sous `last`,
     * ne rend nulle part les termes qu'il a relâchés — et il n'existe pas
     * d'ensemble global : seul le PREMIER terme est obligatoire, document par
     * document. Une implémentation qui « devine » en désignant le dernier mot
     * cocherait le test précédent et rougirait ici.
     *
     * ⚠ Le COMPTE élargi, lui, dépend bel et bien de l'ordre, et c'est le
     * moteur qui le décide : `villa Mbour` élargi rend 4 (le premier terme,
     * « villa », est obligatoire), `Mbour villa` élargi rend 0. Les deux sont
     * honnêtes. On l'épingle pour que personne ne « corrige » cette asymétrie
     * en croyant à un défaut.
     */
    public function test_le_terme_nomme_ne_depend_pas_de_sa_position(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $enTete = $this->service()->search(['q' => 'Mbour villa']);
        $enQueue = $this->service()->search(['q' => 'villa Mbour']);

        $this->assertSame(['Mbour'], $enTete['search']['terms_unmatched']);
        $this->assertSame(['Mbour'], $enQueue['search']['terms_unmatched']);
        $this->assertSame('widened', $enTete['search']['strategy']);

        $this->assertSame(0, $enTete['search']['widened_total']);
        $this->assertSame(4, $enQueue['search']['widened_total']);
    }

    /**
     * Quand chaque terme existe mais que leur intersection est vide, on ne
     * nomme AUCUN terme.
     *
     * « villa » rend 4 biens, « Ngor » en rend 1 : les deux mots sont vrais
     * séparément. Désigner l'un d'eux serait inventer un coupable. Le front
     * doit dire « aucun bien ne réunit tous ces mots », avec le compte élargi.
     *
     * Une implémentation qui nommerait tous les termes dès que le total vaut 0
     * cocherait les deux tests précédents et rougirait ici.
     */
    public function test_le_repli_ne_nomme_aucun_terme_quand_lintersection_seule_est_vide(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // Les deux sondes, rejouées : aucun des deux mots n'est vide.
        $this->assertSame(4, $this->service()->search(['q' => 'villa'])['meta']['total']);
        $this->assertSame(1, $this->service()->search(['q' => 'Ngor'])['meta']['total']);

        $resultat = $this->service()->search(['q' => 'villa Ngor']);

        $this->assertSame('widened', $resultat['search']['strategy']);
        $this->assertSame([], $resultat['search']['terms_unmatched']);
        $this->assertSame(4, $resultat['search']['widened_total']);
        $this->assertSame(4, $resultat['meta']['total']);
    }

    /**
     * La phrase rendue est vraie DANS LE CONTEXTE AFFICHÉ.
     *
     * Une villa existe à Saly. Sous `city=Dakar`, elle n'est pas dans le
     * catalogue que l'utilisateur regarde : « aucun bien ne correspond à
     * *Saly* » est alors vrai, et c'est ce que la réponse doit dire.
     *
     * ABLATION — sonder sans le filtre structuré (ne passer que
     * `publicFilter()` aux sondes) : la sonde « Saly » rendrait 1,
     * `terms_unmatched` deviendrait `[]`, et l'interface annoncerait « aucun
     * bien ne réunit tous ces mots » pour une requête dont un mot ne
     * correspond à rien de visible. L'assertion centrale rougit.
     */
    public function test_le_repli_sonde_sous_le_filtre_structure_de_la_requete(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // Hors filtre, « Saly » correspond à quelque chose.
        $this->assertSame(1, $this->service()->search(['q' => 'Saly'])['meta']['total']);
        // Sous `city=Dakar`, non.
        $this->assertSame(0, $this->service()->search(['q' => 'Saly', 'city' => 'Dakar'])['meta']['total']);

        $resultat = $this->service()->search(['q' => 'villa Saly', 'city' => 'Dakar']);

        $this->assertSame('widened', $resultat['search']['strategy']);
        $this->assertSame(['Saly'], $resultat['search']['terms_unmatched']);

        // Le repli reste enfermé dans le filtre : la villa de Saly n'apparaît
        // PAS dans les résultats élargis.
        $this->assertSame(3, $resultat['meta']['total']);
        $this->assertSame(
            $this->idsAttendus('villa_dakar_1', 'villa_dakar_2', 'villa_dakar_3'),
            $this->idsRendus($resultat),
        );
    }

    /**
     * Le résultat élargi se pagine comme n'importe quel autre.
     *
     * `widened_total` ne doit jamais dire autre chose que `meta.total`, et
     * `last_page` doit se déduire du même compte : un repli qui rendrait un
     * compte élargi sur une pagination restée conjonctive promettrait des
     * pages qui n'existent pas.
     */
    public function test_le_repli_ne_ment_pas_sur_la_pagination(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $page1 = $this->service()->search(['q' => 'villa Mbour', 'per_page' => 3, 'page' => 1]);

        $this->assertSame('widened', $page1['search']['strategy']);
        $this->assertSame(4, $page1['meta']['total']);
        $this->assertSame(4, $page1['search']['widened_total']);
        $this->assertSame(2, $page1['meta']['last_page']);
        $this->assertCount(3, $page1['data']);

        $page2 = $this->service()->search(['q' => 'villa Mbour', 'per_page' => 3, 'page' => 2]);

        $this->assertSame(2, $page2['meta']['current_page']);
        $this->assertCount(1, $page2['data']);

        $reunies = [...$this->idsRendus($page1), ...$this->idsRendus($page2)];
        sort($reunies);
        $this->assertSame(
            $this->idsAttendus('villa_dakar_1', 'villa_dakar_2', 'villa_dakar_3', 'villa_saly'),
            $reunies,
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. Ce que le repli ne doit PAS faire
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Un seul terme utile ne déclenche jamais le repli.
     *
     * `q=Mbour` rend 0 — et c'est la bonne réponse, définitive : il n'y a rien
     * à relâcher. Une implémentation qui élargirait dès que le total vaut 0
     * rejouerait une requête inutile et étiquetterait `widened` une réponse
     * qui ne l'est pas.
     *
     * Les MOTS VIDES comptent ici : « à Mbour » porte deux mots et UN seul
     * terme utile. Sans la lecture de `stopWords` dans `config/scout.php`, le
     * service croirait à deux termes et replierait.
     */
    public function test_un_seul_terme_utile_ne_declenche_pas_le_repli(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        foreach (['Mbour', 'à Mbour', 'de Mbour'] as $requete) {
            $resultat = $this->service()->search(['q' => $requete]);

            $this->assertSame(0, $resultat['meta']['total'], "q={$requete}");
            $this->assertSame('all', $resultat['search']['strategy'], "q={$requete}");
            $this->assertSame([], $resultat['search']['terms_unmatched'], "q={$requete}");
            $this->assertNull($resultat['search']['widened_total'], "q={$requete}");
        }
    }

    /**
     * Une requête qui aboutit reste en régime nominal, et son bloc `search` le
     * dit — sans `widened_total`.
     *
     * C'est le versant « une régression le cocherait-elle aussi ? » du test du
     * repli : un service qui replierait TOUJOURS rendrait les mêmes résultats
     * ici, avec la mauvaise étiquette. Le front les présenterait alors comme
     * approximatifs alors qu'ils sont exacts.
     */
    public function test_une_requete_qui_aboutit_reste_en_regime_nominal(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        foreach (['villa', 'villa Dakar', 'villa Saly', ''] as $requete) {
            $resultat = $this->service()->search(['q' => $requete]);

            $this->assertSame('all', $resultat['search']['strategy'], "q={$requete}");
            $this->assertSame([], $resultat['search']['terms_unmatched'], "q={$requete}");
            $this->assertNull($resultat['search']['widened_total'], "q={$requete}");
        }
    }

    /**
     * Les mots vides ne deviennent jamais des termes exigés.
     *
     * C'est le point où les trois leviers de TCK-335 et celui-ci se valident
     * ENSEMBLE : `all` exige tous les termes, et si « à » en était un, la
     * requête la plus naturelle du français — « villa à louer à Dakar » —
     * rendrait 0 sur un catalogue où trois biens la satisfont.
     *
     * ⚠ Le ticket affirmait précisément cela — « `villa a louer a Dakar` → 0,
     * `a vendre` → 0 sous `all` seul ». Re-mesuré le 2026-08-21, TCK-335 en
     * place : **35** et **54** sur le catalogue local. Les chiffres du ticket
     * dataient d'AVANT la dépendance qu'il déclarait satisfaite.
     */
    public function test_les_mots_vides_ne_deviennent_pas_des_termes_exiges(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $resultat = $this->service()->search(['q' => 'une villa à louer à Dakar']);

        $this->assertSame('all', $resultat['search']['strategy']);
        $this->assertSame(3, $resultat['meta']['total']);
        $this->assertSame(
            $this->idsAttendus('villa_dakar_1', 'villa_dakar_2', 'villa_dakar_3'),
            $this->idsRendus($resultat),
        );
    }

    /**
     * Le contrat de bout en bout : le bloc `search` traverse l'endpoint HTTP.
     *
     * Un service juste dont la réponse n'atteint pas le client ne sert à rien —
     * et c'est exactement ce qui attend `terms_unmatched` côté front, qui ne
     * l'affiche pas encore (hors périmètre de TCK-338).
     */
    public function test_le_bloc_search_traverse_lendpoint_public(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $this->getJson('/api/public/properties/search?q=villa+Mbour')
            ->assertOk()
            ->assertJsonStructure([
                'data',
                'facets' => ['locations', 'bedrooms', 'types'],
                'meta' => ['total', 'per_page', 'current_page', 'last_page'],
                'search' => ['strategy', 'terms_unmatched', 'widened_total'],
            ])
            ->assertJsonPath('search.strategy', 'widened')
            ->assertJsonPath('search.terms_unmatched', ['Mbour'])
            ->assertJsonPath('search.widened_total', 4)
            ->assertJsonPath('meta.total', 4)
            ->assertJsonCount(4, 'data');

        $this->getJson('/api/public/properties/search?q=villa')
            ->assertOk()
            ->assertJsonPath('search.strategy', 'all')
            ->assertJsonPath('search.terms_unmatched', [])
            ->assertJsonPath('search.widened_total', null);
    }

    /**
     * Ids attendus, TRIÉS — l'ordre du moteur n'est pas l'objet de ces
     * assertions-là.
     *
     * @return array<int,int>
     */
    private function idsAttendus(string ...$cles): array
    {
        $ids = array_map(fn (string $cle) => $this->biens[$cle]->id, $cles);
        sort($ids);

        return $ids;
    }

    /**
     * @param  array{data:array<int,mixed>}  $resultat
     * @return array<int,int>
     */
    private function idsRendus(array $resultat, bool $trier = true): array
    {
        $ids = array_map(static fn (array $bien): int => (int) $bien['id'], $resultat['data']);
        if ($trier) {
            sort($ids);
        }

        return $ids;
    }
}
