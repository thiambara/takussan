<?php

namespace Tests\Feature\Search;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Services\Search\PropertySearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-335, étape 8 — le vocabulaire d'INTENTION atteint l'index.
 *
 * Ce que ces tests épinglent : un mot que l'utilisateur écrit en français
 * courant — « louer », « à vendre », « meublé », « piscine » — atteint les
 * biens que la COLONNE décrit, et non ceux dont le texte libre a eu la chance
 * de porter le mot.
 *
 * ── POURQUOI LES FIXTURES ONT DES TITRES MUETS ────────────────────────────
 *
 * Aucun titre de ce fichier ne contient « louer », « vendre » ni « meublé »,
 * SAUF là où le classement est ce qu'on mesure. C'est la seule forme qui
 * rende ces tests capables de rougir : sur le jeu de démonstration,
 * `q=louer` rendait déjà 7 biens le 2026-08-21 — non parce que la recherche
 * marchait, mais par ACCIDENT DE GABARIT, sept titres disant « Chambre à
 * louer à … ». Un seuil mal choisi (« au moins 5 ») serait passé au vert sans
 * une ligne de `contract_label`. Chaque assertion ci-dessous est donc une
 * ÉGALITÉ sur un ensemble d'ids que le texte seul ne peut pas produire.
 *
 * ── ABLATIONS VÉRIFIÉES ───────────────────────────────────────────────────
 *
 * Chaque test nomme le champ ou le réglage dont le retrait le fait rougir ;
 * les quatre ablations ont été jouées.
 */
class PropertySearchVocabularyTest extends TestCase
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
     * Corpus commun : 3 biens en location, 2 en vente, 2 meublés (un de
     * chaque contrat), 1 tagué « Piscine ».
     *
     * ⚠ Les descriptions sont ÉCRITES, jamais tirées par la factory : le
     * `fake()->paragraphs()` du défaut produit du texte latin dont on ne
     * contrôle pas les jetons, et un « a » de lorem ipsum suffirait à rendre
     * le test des mots vides ininterprétable.
     */
    private function semerLeCorpus(): void
    {
        $this->biens['location_studio'] = $this->publier([
            'title' => 'Studio moderne à Mermoz',
            'description' => 'Proche des commerces et des écoles.',
            'contract_type' => ContractType::Rent,
            'type' => PropertyType::Studio,
            'furnished' => false,
        ]);

        $this->biens['location_appartement'] = $this->publier([
            'title' => 'Appartement F3 à Fann',
            'description' => 'Quartier calme et sécurisé.',
            'contract_type' => ContractType::Rent,
            'type' => PropertyType::Apartment,
            'furnished' => true,
        ]);

        $this->biens['location_villa'] = $this->publier([
            'title' => 'Villa contemporaine à Ngor',
            'description' => 'Environnement verdoyant, eau et électricité disponibles.',
            'contract_type' => ContractType::Rent,
            'type' => PropertyType::Villa,
            'furnished' => false,
        ]);

        // Sa DESCRIPTION dit littéralement « location » — c'est le bien qui
        // sert de témoin de classement (cf. test_le_vocabulaire_elargit…).
        // La tournure est celle du jeu de démonstration lui-même
        // (`SenegalFakerProvider::$idealFor`), pas une construction de test.
        $this->biens['vente_terrain'] = $this->publier([
            'title' => 'Terrain viabilisé à Yoff',
            'description' => 'Idéal pour une location saisonnière.',
            'contract_type' => ContractType::Sale,
            'type' => PropertyType::Land,
            'furnished' => false,
        ]);

        $this->biens['vente_maison'] = $this->publier([
            'title' => 'Maison de standing à Ouakam',
            'description' => 'Voies d\'accès asphaltées.',
            'contract_type' => ContractType::Sale,
            'type' => PropertyType::House,
            'furnished' => true,
        ]);

        // DEUX villas, une par contrat. C'est ce couple qui rend mesurable la
        // question de tête de l'audit — « villa à louer » doit RESTREINDRE, pas
        // seulement classer (cf. test_une_phrase_en_francais_courant…).
        $this->biens['vente_villa'] = $this->publier([
            'title' => 'Villa luxueuse à Almadies',
            'description' => 'Vue dégagée sur l\'océan.',
            'contract_type' => ContractType::Sale,
            'type' => PropertyType::Villa,
            'furnished' => false,
        ]);
    }

    /** @param array<string,mixed> $attributs */
    private function publier(array $attributs): Property
    {
        return Property::factory()->published()->create($attributs);
    }

    public function test_le_mot_dintention_louer_atteint_les_biens_en_location(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // Trois orthographes de la même intention, un seul ensemble attendu.
        // Aucune n'apparaît dans un titre ni dans une description du corpus :
        // sans `contract_label`, les trois rendent 0.
        foreach (['louer', 'bail', 'loyer'] as $terme) {
            $resultat = $this->service()->search(['q' => $terme]);

            $this->assertSame(3, $resultat['meta']['total'], "q={$terme}");
            $this->assertSame(
                $this->idsAttendus('location_studio', 'location_appartement', 'location_villa'),
                $this->idsRendus($resultat),
                "q={$terme}",
            );
        }
    }

    public function test_le_mot_dintention_vendre_atteint_les_biens_en_vente(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // « vente » et « vendre » n'apparaissaient dans le texte d'AUCUN bien
        // du catalogue public le 2026-08-21 (q=vente → 0 pour 54 biens en
        // vente). C'est très exactement ce que ce test reproduit en petit : le
        // texte ne porte pas le mot, la colonne oui.
        foreach (['vendre', 'vente', 'achat', 'acheter'] as $terme) {
            $resultat = $this->service()->search(['q' => $terme]);

            $this->assertSame(3, $resultat['meta']['total'], "q={$terme}");
            $this->assertSame(
                $this->idsAttendus('vente_terrain', 'vente_maison', 'vente_villa'),
                $this->idsRendus($resultat),
                "q={$terme}",
            );
        }
    }

    public function test_les_mots_vides_neutralisent_le_bruit_de_a_vendre(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // Les SIX titres du corpus portent « à » — c'est délibéré. Sans
        // `stopWords`, « à » devient un terme à part entière : la stratégie
        // de correspondance de Meilisearch retire les termes par la FIN, donc
        // « a vendre » se réduit à « a », et tout le corpus remonte. C'est le
        // mécanisme exact qui faisait rendre 247 biens sur 258 à
        // `q=a vendre` le 2026-08-21 — du bruit pur, compté dans `meta.total`.
        foreach (['à vendre', 'a vendre'] as $terme) {
            $resultat = $this->service()->search(['q' => $terme]);

            $this->assertSame(3, $resultat['meta']['total'], "q={$terme}");
            $this->assertSame(
                $this->idsAttendus('vente_terrain', 'vente_maison', 'vente_villa'),
                $this->idsRendus($resultat),
                "q={$terme}",
            );
        }
    }

    /**
     * TCK-338 — CE TEST A CHANGÉ DE SENS, et il faut lire pourquoi avant de
     * lire ses chiffres.
     *
     * Sa version TCK-335 assertait `total === 2` sur les deux requêtes, et
     * portait un avertissement en tête : *« ce que ce test ne prouve pas : le
     * TOTAL reste invariant »*. C'était exact, et c'était le défaut de tête de
     * l'audit — `q=villa Saly` rendait les mêmes 63 résultats que `q=villa`.
     * L'étape 8 ne pouvait alors mesurer que le CLASSEMENT.
     *
     * Depuis ADR-0024, ce total vaut **1**, sur les deux requêtes. **Ce n'est
     * pas une régression, c'est la propriété qu'on voulait** : la phrase
     * RESTREINT désormais, elle ne se contente plus de classer. Les deux
     * villas du corpus ne diffèrent que par leur contrat, et rien dans leur
     * texte ne le dit — la seule voie possible reste `contract_label`.
     *
     * Ce que ce test épingle donc maintenant, et que ni TCK-335 ni TCK-338 ne
     * tiennent seuls :
     *
     *  - `contract_label` (TCK-335) : sans lui, le mot « louer » n'atteint
     *    aucune des deux villas et `all` rend **0** au lieu de 1 ;
     *  - `stopWords` (TCK-335) : sans eux, « une » et « à » deviennent des
     *    termes exigés, qu'aucun bien ne porte, et `all` rend **0** ;
     *  - `matchingStrategy: 'all'` (TCK-338) : sans lui, les deux requêtes
     *    rendent **2**, c'est-à-dire les deux villas, et le mot d'intention ne
     *    sert plus qu'à les ordonner.
     *
     * Les trois leviers ne se valident qu'ENSEMBLE — c'est la seule chose que
     * la section « Contraintes strictes » du ticket avait vue juste.
     */
    public function test_une_phrase_en_francais_courant_restreint_au_bon_contrat(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $toutesLesVillas = $this->service()->search(['q' => 'villa']);
        $this->assertSame(2, $toutesLesVillas['meta']['total']);

        $aLouer = $this->service()->search(['q' => 'une villa à louer']);
        $this->assertSame(1, $aLouer['meta']['total']);
        $this->assertSame($this->idsAttendus('location_villa'), $this->idsRendus($aLouer));
        // Le régime NOMINAL, pas le repli : la conjonction aboutit d'elle-même.
        // Sans cette assertion, un repli qui se déclencherait à tort rendrait
        // le même ensemble avec la mauvaise étiquette.
        $this->assertSame('all', $aLouer['search']['strategy']);

        $aVendre = $this->service()->search(['q' => 'une villa à vendre']);
        $this->assertSame(1, $aVendre['meta']['total']);
        $this->assertSame($this->idsAttendus('vente_villa'), $this->idsRendus($aVendre));
        $this->assertSame('all', $aVendre['search']['strategy']);

        // Et les deux ensembles sont bien DISJOINTS : la villa en vente ne
        // sort pas sur « à louer », et réciproquement. C'est ce qu'un
        // classement seul ne pouvait pas garantir.
        $this->assertNotSame($this->idsRendus($aLouer), $this->idsRendus($aVendre));
    }

    public function test_meuble_atteint_exactement_les_biens_meubles(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // `furnished_label` est le SEUL chemin possible : ni synonyme, ni
        // alias de type, ni tag searchable ne peuvent faire correspondre le
        // mot « meublé » à une colonne booléenne. Le corpus ne l'écrit nulle
        // part en texte libre.
        foreach (['meublé', 'meuble', 'équipé'] as $terme) {
            $resultat = $this->service()->search(['q' => $terme]);

            $this->assertSame(2, $resultat['meta']['total'], "q={$terme}");
            $this->assertSame(
                $this->idsAttendus('location_appartement', 'vente_maison'),
                $this->idsRendus($resultat),
                "q={$terme}",
            );
        }

        // Le compte du moteur et celui du filtre décrivent le MÊME ensemble.
        $parFiltre = $this->service()->search(['furnished' => true]);
        $this->assertSame($parFiltre['meta']['total'], 2);
    }

    public function test_un_tag_dequipement_est_atteignable_par_le_texte(): void
    {
        $this->semerLeCorpus();

        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Feature]);
        $this->biens['location_villa']->tags()->attach($piscine);

        $this->indexProperties();

        // `tags` était `filterable` sans être `searchable` : un mot
        // d'équipement ne pouvait atteindre l'index que s'il traînait dans une
        // description. Aucun titre ni aucune description du corpus ne dit
        // « piscine ».
        $resultat = $this->service()->search(['q' => 'piscine']);

        $this->assertSame(1, $resultat['meta']['total']);
        $this->assertSame($this->idsAttendus('location_villa'), $this->idsRendus($resultat));

        // Le filtre par tag, lui, décrivait déjà le bon ensemble — on vérifie
        // que le texte et le filtre convergent, plutôt que de se croire.
        $parFiltre = $this->service()->search(['tags' => 'Piscine']);
        $this->assertSame(1, $parFiltre['meta']['total']);
    }

    public function test_le_vocabulaire_elargit_le_rappel_sans_reordonner_la_pertinence(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $resultat = $this->service()->search(['q' => 'location']);

        // RAPPEL : 3 biens par `contract_label` + 1 dont la description dit
        // littéralement « location ». Sans `contract_label`, ce total vaut 1.
        $this->assertSame(4, $resultat['meta']['total']);

        // CLASSEMENT : le bien dont le TEXTE porte le mot passe devant les
        // trois que seule leur colonne désigne — bien qu'il soit en VENTE.
        //
        // ⚠ C'est la position de `contract_label` dans `searchableAttributes`
        // qui le décide, et elle est MESURÉE, pas déduite (config/scout.php).
        // Mesuré le 2026-08-21 sur le jeu local de 258 biens publics, en
        // basculant le seul ordre : `contract_label` EN DERNIER → le bien en
        // vente dont la description dit « location » est 20ᵉ sur 211, score
        // `attribute` 0,778 ; `contract_label` EN TÊTE → il tombe 205ᵉ sur
        // 211, score 0,556, et les 204 biens en location passent devant à
        // 1,000. Un mot d'intention vaut pour 204 biens à la fois : il n'a
        // aucun pouvoir discriminant, il ne doit donc rien réordonner.
        $this->assertSame(
            $this->biens['vente_terrain']->id,
            $this->idsRendus($resultat, trier: false)[0],
        );
    }

    /**
     * Ids attendus, TRIÉS — l'ordre du moteur n'est pas l'objet de ces
     * assertions-là (sauf celle qui le mesure explicitement).
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
