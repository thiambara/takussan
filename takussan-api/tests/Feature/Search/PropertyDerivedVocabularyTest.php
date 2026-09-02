<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Enums\TitleType;
use App\Models\Property;
use App\Services\Search\PropertySearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-506 — le vocabulaire immobilier DÉRIVÉ des colonnes atteint l'index.
 *
 * Ce que ces tests épinglent : « F4 », « T4 », « 3 chambres », « chambre
 * salon », « R+1 », « rdc », « TF », « appart » atteignent les biens que les
 * COLONNES décrivent, et non ceux dont le texte libre a eu la chance de
 * porter le mot.
 *
 * ── POURQUOI LES TITRES SONT MUETS ─────────────────────────────────────────
 *
 * Aucun titre ni aucune description du corpus ne contient F4, T4,
 * « chambre », « salon », « R+1 », « rdc », « TF », « foncier »
 * ni « appart » — sauf le témoin du test de classement, dont le titre dit
 * « Appartement … Mermoz » exprès. C'est la seule forme qui rende ces tests capables de rougir :
 * chaque assertion est une ÉGALITÉ sur un ensemble d'ids que le texte seul ne
 * peut pas produire (même règle que `PropertySearchVocabularyTest`).
 *
 * ── LE SECOND MEMBRE ───────────────────────────────────────────────────────
 *
 * Le corpus porte un bien à 4 chambres ET un bien à 3 chambres : sous la
 * convention inversée (F4 = 4 chambres), `q=F4` rendrait l'autre. Il porte
 * aussi un TERRAIN à 3 chambres — la fixture du seed défectueux — que `q=F4`
 * ne doit jamais rendre.
 *
 * ── CE QUE `derived_title` ACHÈTE, ET CE QU'IL N'ACHÈTE PAS ────────────────
 *
 * Par construction, le titre dérivé ne porte AUCUN jeton que les autres
 * champs n'aient déjà : « F4 » est dans `rooms_label`, « Appartement » dans
 * `type_label`, « Mermoz, Dakar » dans `neighborhood`/`city`. Il n'élargit
 * donc pas l'ENSEMBLE rendu — mesuré : son ablation laisse verts AC1 à AC5.
 * Ce qu'il achète est le CLASSEMENT : ces jetons sont dans UN champ, côte à
 * côte, et la règle `proximity` (avant `attribute`) les préfère aux mêmes
 * mots dispersés sur trois champs. Le test de classement l'épingle — c'est le
 * seul de ce fichier que son ablation fait rougir.
 *
 * ── ABLATIONS ──────────────────────────────────────────────────────────────
 *
 * Retirer `rooms_label` de `toSearchableArray()` fait rougir AC2 et AC3 —
 * PAS AC1, que `derived_title` couvre pour « F4 » seul ; retirer les DEUX
 * fait rougir AC1. Retirer `facts_label` fait rougir AC4. Retirer
 * `derived_title` fait rougir le test de classement. Jouées le 2026-09-02,
 * relevé dans les notes du ticket.
 */
class PropertyDerivedVocabularyTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var array<string,Property> */
    private array $biens = [];

    private function service(): PropertySearchService
    {
        return app(PropertySearchService::class);
    }

    private function semerLeCorpus(): void
    {
        $this->biens['appart_3ch'] = $this->publier([
            'title' => 'Bel espace lumineux à Mermoz',
            'description' => 'Proche des commerces et des écoles.',
            'type' => PropertyType::Apartment,
            'bedrooms' => 3,
            'floor_number' => 2,
            'total_floors' => 6,
            'area' => 95,
        ], 'Mermoz', 'Dakar');

        // Même famille, une chambre de plus : le témoin de la convention.
        $this->biens['appart_4ch'] = $this->publier([
            'title' => 'Grand volume à Fann',
            'description' => 'Quartier calme et sécurisé.',
            'type' => PropertyType::Apartment,
            'bedrooms' => 4,
            'floor_number' => 0,
            'area' => 120,
        ], 'Fann', 'Dakar');

        $this->biens['maison_3ch'] = $this->publier([
            'title' => 'Demeure familiale à Ouakam',
            'description' => 'Voies d\'accès asphaltées.',
            'type' => PropertyType::House,
            'bedrooms' => 3,
            'area' => 220,
        ], 'Ouakam', 'Dakar');

        $this->biens['appart_1ch'] = $this->publier([
            'title' => 'Petit nid à Yoff',
            'description' => 'Idéal pour une première installation.',
            'type' => PropertyType::Apartment,
            'bedrooms' => 1,
            'area' => 45,
        ], 'Yoff', 'Dakar');

        $this->biens['studio'] = $this->publier([
            'title' => 'Studio moderne à Point E',
            'description' => 'Environnement verdoyant.',
            'type' => PropertyType::Studio,
            'bedrooms' => 1,
            'area' => 28,
        ], 'Point E', 'Dakar');

        // Le seed défectueux, reconstitué exprès : un terrain « à 3 chambres ».
        $this->biens['terrain_3ch'] = $this->publier([
            'title' => 'Parcelle viabilisée à Keur Massar',
            'description' => 'Eau et électricité disponibles.',
            'type' => PropertyType::Land,
            'bedrooms' => 3,
            'area' => 300,
            'title_type' => TitleType::TitreFoncier,
        ], 'Keur Massar', 'Dakar');

        $this->biens['terrain_bail'] = $this->publier([
            'title' => 'Terrain nu à Saly',
            'description' => 'En bordure de route.',
            'type' => PropertyType::Land,
            'bedrooms' => null,
            'area' => 500,
            'title_type' => TitleType::Bail,
        ], 'Saly', 'Mbour');

        $this->biens['villa_r1'] = $this->publier([
            'title' => 'Villa contemporaine à Ngor',
            'description' => 'Vue dégagée sur l\'océan.',
            'type' => PropertyType::Villa,
            'bedrooms' => 4,
            'total_floors' => 1,
            'area' => 260,
        ], 'Ngor', 'Dakar');

        // ⚠ 150 m2 EXPRÈS : le dernier mot d'une requête est complété par
        // préfixe, chiffres compris, et « 1 » matche « 150 ». Sans le
        // dictionnaire de l'index (« R+1 » = un jeton), `q=villa R+1` rendait
        // cette villa basse — et la factory tirait `area` entre 30 et 500, donc
        // le test rougissait une fois sur cinq sans qu'un fichier ait changé
        // (la signature de D-44). Toutes les surfaces du corpus sont épinglées.
        $this->biens['villa_basse'] = $this->publier([
            'title' => 'Villa avec jardin à Almadies',
            'description' => 'Grand jardin arboré.',
            'type' => PropertyType::Villa,
            'bedrooms' => 4,
            'total_floors' => 0,
            'area' => 150,
        ], 'Almadies', 'Dakar');
    }

    /** @param array<string,mixed> $attributs */
    private function publier(array $attributs, string $quartier, string $ville): Property
    {
        $bien = Property::factory()->published()->create($attributs + ['contract_type' => ContractType::Sale]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => $ville,
            'neighborhood' => $quartier,
        ]);

        return $bien;
    }

    // AC1
    public function test_f4_atteint_les_trois_chambres_et_jamais_les_quatre(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $resultat = $this->service()->search(['q' => 'F4']);

        $this->assertSame('all', $resultat['search']['strategy']);
        $this->assertSame($this->idsAttendus('appart_3ch', 'maison_3ch'), $this->idsRendus($resultat));
    }

    // AC2
    public function test_t4_quatre_pieces_et_trois_chambres_salon_rendent_le_meme_ensemble(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $reference = $this->idsRendus($this->service()->search(['q' => 'F4']));
        $this->assertSame($this->idsAttendus('appart_3ch', 'maison_3ch'), $reference);

        foreach (['T4', '3 chambres', '3 chambres salon', 'appartement F4'] as $requete) {
            $resultat = $this->service()->search(['q' => $requete]);
            $this->assertSame('all', $resultat['search']['strategy'], "« {$requete} » a dû être élargi");

            $attendu = $requete === 'appartement F4'
                ? $this->idsAttendus('appart_3ch')
                : $reference;
            $this->assertSame($attendu, $this->idsRendus($resultat), "q={$requete}");
        }
    }

    // AC3 — « chambre » a 7 lettres, donc UNE faute tolérée : « chambres »
    // matche aussi, et les biens à n ≥ 2 chambres entrent dans l'ensemble.
    // C'est le CLASSEMENT qui tranche (règles `typo` puis `exactness`) : le
    // bien à 1 chambre, seul à porter « chambre » exact, sort en premier.
    public function test_chambre_salon_classe_une_chambre_en_premier_et_aucun_studio(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $resultat = $this->service()->search(['q' => 'chambre salon']);
        $ids = $this->idsRendus($resultat, trier: false);
        $this->assertSame($this->biens['appart_1ch']->id, $ids[0]);
        $this->assertNotContains($this->biens['studio']->id, $ids);
        $this->assertNotContains($this->biens['terrain_3ch']->id, $ids);

        $studios = $this->service()->search(['q' => 'studio']);
        $this->assertSame($this->idsAttendus('studio'), $this->idsRendus($studios));
    }

    // AC4
    public function test_r_plus_1_rdc_et_tf_atteignent_les_colonnes_qui_les_portent(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        foreach (['villa R+1', 'villa r+1', 'villa R+1 '] as $requete) {
            $this->assertSame(
                $this->idsAttendus('villa_r1'),
                $this->idsRendus($this->service()->search(['q' => $requete])),
                "q={$requete}",
            );
        }
        $this->assertSame(
            $this->idsAttendus('villa_basse'),
            $this->idsRendus($this->service()->search(['q' => 'villa basse'])),
        );
        // Le chiffre de « R+1 » n'est PAS un chiffre nu : la villa R+1 à
        // 4 chambres ne répond pas à « 1 chambre » (mesuré sans dictionnaire :
        // elle y répondait).
        $uneChambre = $this->idsRendus($this->service()->search(['q' => '1 chambre']), trier: false);
        $this->assertSame($this->biens['appart_1ch']->id, $uneChambre[0]);
        $this->assertNotContains($this->biens['villa_r1']->id, $uneChambre);
        $this->assertSame(
            $this->idsAttendus('appart_4ch'),
            $this->idsRendus($this->service()->search(['q' => 'rdc'])),
        );
        // « TF » : le terrain en titre foncier, PAS celui en bail.
        $this->assertSame(
            $this->idsAttendus('terrain_3ch'),
            $this->idsRendus($this->service()->search(['q' => 'terrain TF'])),
        );
        $this->assertSame(
            $this->idsAttendus('terrain_3ch'),
            $this->idsRendus($this->service()->search(['q' => 'titre foncier'])),
        );
        $this->assertSame(
            $this->idsAttendus('terrain_bail'),
            $this->idsRendus($this->service()->search(['q' => 'terrain 500 m2'])),
        );
    }

    // AC5 — couvert par AC1 (le terrain à 3 chambres n'y est pas), épinglé seul.
    public function test_un_terrain_a_chambres_nest_jamais_un_f4(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $ids = $this->idsRendus($this->service()->search(['q' => 'F4']));

        $this->assertNotContains($this->biens['terrain_3ch']->id, $ids);
    }

    public function test_appart_atteint_les_appartements_meme_en_tete_de_requete(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // Avant TCK-506, « appart » n'était complété (préfixe) que comme DERNIER
        // mot : `q=appart F4` rendait 0. Mesuré le 2026-09-02.
        $resultat = $this->service()->search(['q' => 'appart F4']);

        $this->assertSame('all', $resultat['search']['strategy']);
        $this->assertSame($this->idsAttendus('appart_3ch'), $this->idsRendus($resultat));
    }

    public function test_le_titre_derive_atteint_le_lieu_et_le_type_sans_texte(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        // « Bel espace lumineux à Mermoz » ne dit ni « appartement » ni « Dakar » :
        // c'est `derived_title` (« Appartement F4 à Mermoz, Dakar ») qui répond.
        $resultat = $this->service()->search(['q' => 'appartement F4 Mermoz Dakar']);

        $this->assertSame('all', $resultat['search']['strategy']);
        $this->assertSame($this->idsAttendus('appart_3ch'), $this->idsRendus($resultat));
    }

    /**
     * Le témoin : un APPARTEMENT à 3 chambres à Ouakam dont le titre dit
     * « Appartement avec vue sur Mermoz ». Sur `q=appartement F4 Mermoz`, les
     * deux biens portent les trois mots. Sans `derived_title`, le témoin passe
     * DEVANT l'appartement qui EST à Mermoz : « appartement » et « Mermoz »
     * sont dans son `title` (premier attribut), quand ceux de l'autre viennent
     * de `type_label` et de `neighborhood` — `proximity` est à égalité (chaque
     * paire de mots est inter-champs des deux côtés), et `attribute` tranche
     * pour le texte libre. Avec `derived_title`, « Appartement F4 à Mermoz »
     * est UNE phrase dans UN champ, et `proximity` — qui passe AVANT
     * `attribute` — la préfère.
     *
     * Mesuré le 2026-09-02 sur un index jetable avec `showRankingScoreDetails`,
     * doc à Mermoz contre témoin : proximity 0,857 contre 0,571 AVEC le champ
     * (l'appartement de Mermoz gagne), 0,142 contre 0,142 SANS, puis attribute
     * 0,644 contre 0,703 (le témoin gagne). ⚠ `proximity` est sensible à
     * l'ORDRE des mots : `q=appartement Mermoz F4` rend le témoin premier dans
     * les deux cas (0,571 contre 0,428). Le test épingle la forme où le champ
     * décide ; c'est le seul de ce fichier que son ablation fait rougir.
     */
    public function test_le_titre_derive_classe_le_bien_que_les_colonnes_decrivent_avant_celui_que_le_texte_frole(): void
    {
        $this->semerLeCorpus();
        $temoin = $this->publier([
            'title' => 'Appartement avec vue sur Mermoz',
            'description' => 'Quartier calme et arboré.',
            'type' => PropertyType::Apartment,
            'bedrooms' => 3,
            'area' => 90,
        ], 'Ouakam', 'Dakar');
        $this->indexProperties();

        $resultat = $this->service()->search(['q' => 'appartement F4 Mermoz']);
        $ids = $this->idsRendus($resultat, trier: false);

        $this->assertSame('all', $resultat['search']['strategy']);
        $this->assertContains($temoin->id, $ids, 'le témoin porte bien les trois mots');
        $this->assertSame($this->biens['appart_3ch']->id, $ids[0], 'sans derived_title, le témoin passe devant');
    }

    // AC8 — aucun champ dérivé ne sort de l'API.
    public function test_les_champs_derives_ne_sortent_pas_de_lapi(): void
    {
        $this->semerLeCorpus();
        $this->indexProperties();

        $resultat = $this->service()->search(['q' => 'F4']);

        foreach ($resultat['data'] as $bien) {
            foreach (['derived_title', 'rooms_label', 'facts_label'] as $champ) {
                $this->assertArrayNotHasKey($champ, $bien);
            }
        }

        $reponse = $this->getJson('/api/public/properties/search?q=F4');
        $reponse->assertOk();
        $this->assertStringNotContainsString('derived_title', $reponse->getContent());
        $this->assertStringNotContainsString('rooms_label', $reponse->getContent());
        $this->assertStringNotContainsString('facts_label', $reponse->getContent());
    }

    /** @return array<int,int> */
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
