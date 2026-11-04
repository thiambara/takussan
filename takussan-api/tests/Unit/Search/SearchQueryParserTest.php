<?php

namespace Tests\Unit\Search;

use App\Services\Search\Query\InMemoryPlaceLexicon;
use App\Services\Search\Query\ParsedQuery;
use App\Services\Search\Query\SearchQueryParser;
use App\Services\Tags\TagCatalog;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2473 (ADR-0088) — la saisie libre de la recherche publique devient des critères.
 *
 * Le lexique des lieux est simulé (un {@see InMemoryPlaceLexicon} de quelques lieux réels du référentiel) : le parseur
 * ne touche ni la base ni le réseau. Les saisies sont celles du marché sénégalais.
 */
class SearchQueryParserTest extends TestCase
{
    private SearchQueryParser $parser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->parser = new SearchQueryParser(new InMemoryPlaceLexicon([
            ['kind' => 'city', 'name' => 'Dakar', 'city' => null, 'spelling' => 'Dakar'],
            ['kind' => 'city', 'name' => 'Thiès', 'city' => null, 'spelling' => 'Thiès'],
            ['kind' => 'city', 'name' => 'Diamniadio', 'city' => null, 'spelling' => 'Diamniadio'],
            ['kind' => 'city', 'name' => 'Rufisque', 'city' => null, 'spelling' => 'Rufisque'],
            ['kind' => 'city', 'name' => 'Mbour', 'city' => null, 'spelling' => 'Mbour'],
            ['kind' => 'city', 'name' => 'Saint-Louis', 'city' => null, 'spelling' => 'Saint-Louis'],
            ['kind' => 'city', 'name' => 'Pikine', 'city' => null, 'spelling' => 'Pikine'],
            ['kind' => 'neighborhood', 'name' => 'Pikine', 'city' => 'Saint-Louis', 'spelling' => 'Pikine'],
            ['kind' => 'neighborhood', 'name' => 'Almadies', 'city' => 'Dakar', 'spelling' => 'Almadies'],
            ['kind' => 'neighborhood', 'name' => 'Ngor', 'city' => 'Dakar', 'spelling' => 'Ngor'],
            ['kind' => 'neighborhood', 'name' => 'Mermoz', 'city' => 'Dakar', 'spelling' => 'Mermoz'],
            ['kind' => 'neighborhood', 'name' => 'Ouakam', 'city' => 'Dakar', 'spelling' => 'Ouakam'],
            ['kind' => 'neighborhood', 'name' => 'Point E', 'city' => 'Dakar', 'spelling' => 'Point E'],
            ['kind' => 'neighborhood', 'name' => 'Sacré-Cœur', 'city' => 'Dakar', 'spelling' => 'Sacré-Cœur'],
            ['kind' => 'neighborhood', 'name' => 'Sacré-Cœur 3', 'city' => 'Dakar', 'spelling' => 'Sacré-Cœur 3'],
            ['kind' => 'neighborhood', 'name' => 'Liberté 6', 'city' => 'Dakar', 'spelling' => 'Liberté 6'],
            ['kind' => 'neighborhood', 'name' => 'Grand Yoff', 'city' => 'Dakar', 'spelling' => 'Grand Yoff'],
            ['kind' => 'neighborhood', 'name' => 'Yoff', 'city' => 'Dakar', 'spelling' => 'Yoff'],
            ['kind' => 'neighborhood', 'name' => 'Plateau', 'city' => 'Dakar', 'spelling' => 'Plateau'],
            ['kind' => 'neighborhood', 'name' => 'Cité Keur Gorgui', 'city' => 'Dakar', 'spelling' => 'Cité Keur Gorgui'],
            ['kind' => 'neighborhood', 'name' => 'Médina', 'city' => 'Dakar', 'spelling' => 'Médina'],
            ['kind' => 'neighborhood', 'name' => 'Médina', 'city' => 'Saint-Louis', 'spelling' => 'Médina'],
            ['kind' => 'neighborhood', 'name' => 'Saly Portudal', 'city' => 'Mbour', 'spelling' => 'Saly Portudal'],
            ['kind' => 'neighborhood', 'name' => 'Saly Portudal', 'city' => 'Mbour', 'spelling' => 'Saly'],
            ['kind' => 'neighborhood', 'name' => 'Grand Standing', 'city' => 'Thiès', 'spelling' => 'Grand Standing'],
        ]));
    }

    private function parse(string $q, string $locale = 'fr'): ParsedQuery
    {
        return $this->parser->parse($q, $locale);
    }

    // ───────────────────────────────────────────────────────── les critères d'acceptation

    public function test_ac1_appart_3ch_almadies_moins_de_500k(): void
    {
        $r = $this->parse('appart 3ch Almadies moins de 500k');

        $this->assertSame([
            'type' => 'apartment',
            'price_max' => 500_000,
            'bedrooms' => 3,
            'city' => 'Dakar',
            'location' => 'Almadies',
        ], $r->criteria);
        $this->assertNull($r->residue);
        $this->assertTrue($r->understood);
    }

    public function test_ac2_f3_ngor_a_louer(): void
    {
        $r = $this->parse('f3 ngor à louer');

        $this->assertSame(2, $r->criteria['bedrooms']);
        $this->assertSame('Ngor', $r->criteria['location']);
        $this->assertSame('rent', $r->criteria['contract_type']);
        $this->assertNull($r->residue);
    }

    public function test_ac3_maison_de_ma_tante_rien_d_invente(): void
    {
        $r = $this->parse('maison de ma tante');

        $this->assertSame(['type' => 'house'], $r->criteria);
        // TCK-2476 — « de » non absorbé est un mot vide : il quitte le résidu, « ma tante » reste (rien d'inventé).
        $this->assertSame('ma tante', $r->residue);
        $this->assertTrue($r->understood);
    }

    // ───────────────────────────────────────────────────────── le corpus du marché

    /** @return array<string, array{string, array<string, mixed>, ?string}> */
    public static function saisies(): array
    {
        return [
            'appartement 3 chambres almadies' => ['appartement 3 chambres almadies',
                ['type' => 'apartment', 'bedrooms' => 3, 'city' => 'Dakar', 'location' => 'Almadies'], null],
            'f3 ngor' => ['f3 ngor', ['bedrooms' => 2, 'city' => 'Dakar', 'location' => 'Ngor'], null],
            'villa a louer' => ['villa a louer', ['contract_type' => 'rent', 'type' => 'villa'], null],
            'studio meublé mermoz' => ['studio meublé mermoz',
                ['type' => 'studio', 'furnished' => true, 'city' => 'Dakar', 'location' => 'Mermoz'], null],
            'terrain 300m2 à vendre diamniadio' => ['terrain 300m2 à vendre diamniadio',
                ['contract_type' => 'sale', 'type' => 'land', 'area_min' => 300, 'city' => 'Diamniadio'], null],
            'chambre salon à louer moins de 100 000' => ['chambre salon à louer moins de 100 000',
                ['contract_type' => 'rent', 'price_max' => 100_000, 'bedrooms' => 1], null],
            'appart entre 300k et 600k' => ['appart entre 300k et 600k',
                ['type' => 'apartment', 'price_min' => 300_000, 'price_max' => 600_000], null],
            '1M5' => ['1M5', ['price_max' => 1_500_000], null],
            'villa à vendre 150 millions' => ['villa à vendre 150 millions',
                ['contract_type' => 'sale', 'type' => 'villa', 'price_max' => 150_000_000], null],
            'appartement F4 Point E' => ['appartement F4 Point E',
                ['type' => 'apartment', 'bedrooms' => 3, 'city' => 'Dakar', 'location' => 'Point E'], null],
            'T2 meublé Ouakam par mois' => ['T2 meublé Ouakam par mois',
                ['rent_period' => 'monthly', 'bedrooms' => 1, 'furnished' => true, 'city' => 'Dakar', 'location' => 'Ouakam'], null],
            'studio à louer 150.000f/mois' => ['studio à louer 150.000f/mois',
                ['contract_type' => 'rent', 'type' => 'studio', 'rent_period' => 'monthly', 'price_max' => 150_000], null],
            'location appartement Sacré-Cœur 3 chambres' => ['location appartement Sacré-Cœur 3 chambres',
                ['contract_type' => 'rent', 'type' => 'apartment', 'bedrooms' => 3, 'city' => 'Dakar', 'location' => 'Sacré-Cœur'], null],
            'maison à vendre à Thiès' => ['maison à vendre à Thiès',
                ['contract_type' => 'sale', 'type' => 'house', 'city' => 'Thiès'], null],
            'villa avec piscine Saly' => ['villa avec piscine Saly',
                ['type' => 'villa', 'city' => 'Mbour', 'location' => 'Saly Portudal', 'tags' => 'Piscine'], null],
            'bureau à louer Plateau' => ['bureau à louer Plateau',
                ['contract_type' => 'rent', 'type' => 'office', 'city' => 'Dakar', 'location' => 'Plateau'], null],
            'magasin à louer' => ['magasin à louer', ['contract_type' => 'rent', 'type' => 'shop'], null],
            'local commercial Liberté 6' => ['local commercial Liberté 6',
                ['type' => 'shop', 'city' => 'Dakar', 'location' => 'Liberté 6'], null],
            'entrepôt à louer Rufisque' => ['entrepôt à louer Rufisque',
                ['contract_type' => 'rent', 'type' => 'warehouse', 'city' => 'Rufisque'], null],
            'chambre meublée par nuit' => ['chambre meublée par nuit',
                ['type' => 'room', 'rent_period' => 'daily', 'furnished' => true], null],
            'appartement non meublé' => ['appartement non meublé', ['type' => 'apartment', 'furnished' => false], null],
            'appartement non-meublé' => ['appartement non-meublé', ['type' => 'apartment', 'furnished' => false], null],
            'terrain 500 m2 Diamniadio budget 10 millions' => ['terrain 500 m2 Diamniadio budget 10 millions',
                ['type' => 'land', 'price_max' => 10_000_000, 'area_min' => 500, 'city' => 'Diamniadio'], null],
            'villa 4 chambres plus de 200 millions' => ['villa 4 chambres plus de 200 millions',
                ['type' => 'villa', 'price_min' => 200_000_000, 'bedrooms' => 4], null],
            'appartement à partir de 250 000' => ['appartement à partir de 250 000',
                ['type' => 'apartment', 'price_min' => 250_000], null],
            'max 400k' => ['max 400k', ['price_max' => 400_000], null],
            'jusqu\'à 2 millions' => ['jusqu\'à 2 millions', ['price_max' => 2_000_000], null],
            '< 350 000 fcfa' => ['< 350 000 fcfa', ['price_max' => 350_000], null],
            'entre 1 et 2 millions' => ['entre 1 et 2 millions', ['price_min' => 1_000_000, 'price_max' => 2_000_000], null],
            'entre 300 et 600k' => ['entre 300 et 600k', ['price_min' => 300_000, 'price_max' => 600_000], null],
            'de 50 à 80 millions' => ['villa de 50 à 80 millions',
                ['type' => 'villa', 'price_min' => 50_000_000, 'price_max' => 80_000_000], null],
            '450.000f' => ['450.000f', ['price_max' => 450_000], null],
            '500k Mermoz' => ['500k Mermoz', ['price_max' => 500_000, 'city' => 'Dakar', 'location' => 'Mermoz'], null],
            '4 pièces' => ['appartement 4 pièces', ['type' => 'apartment', 'bedrooms' => 3], null],
            '3 pièces' => ['3 pièces Yoff', ['bedrooms' => 2, 'city' => 'Dakar', 'location' => 'Yoff'], null],
            'deux chambres' => ['appartement deux chambres', ['type' => 'apartment', 'bedrooms' => 2], null],
            '2 chambres salon' => ['2 chambres salon Grand Yoff',
                ['bedrooms' => 2, 'city' => 'Dakar', 'location' => 'Grand Yoff'], null],
            'cité keur gorgui' => ['appartement cite keur gorgui',
                ['type' => 'apartment', 'city' => 'Dakar', 'location' => 'Cité Keur Gorgui'], null],
            'piscine et jardin' => ['villa avec piscine et jardin',
                ['type' => 'villa', 'tags' => 'Piscine,Jardin'], null],
            'clim parking' => ['appartement climatisé avec parking',
                ['type' => 'apartment', 'tags' => 'Climatisation,Parking'], null],
            'parking seul est un type' => ['parking à louer Plateau',
                ['contract_type' => 'rent', 'type' => 'parking', 'city' => 'Dakar', 'location' => 'Plateau'], null],
            'garage d\'une villa' => ['villa garage', ['type' => 'villa', 'tags' => 'Garage'], null],
            'vue sur mer' => ['appartement vue sur mer Almadies',
                ['type' => 'apartment', 'city' => 'Dakar', 'location' => 'Almadies', 'tags' => 'Vue sur mer'], null],
            'chambre de bonne n\'est pas une chambre' => ['villa avec chambre de bonne',
                ['type' => 'villa', 'tags' => 'Chambre de bonne'], null],
            'villa ou maison' => ['villa ou maison à Mbour', ['type' => 'villa,house', 'city' => 'Mbour'], null],
            'terrain 1 hectare' => ['terrain 1 hectare Thiès', ['type' => 'land', 'area_min' => 10_000, 'city' => 'Thiès'], null],
            'immeuble à vendre' => ['immeuble à vendre', ['contract_type' => 'sale', 'type' => 'other'], null],
            'location courte durée' => ['appartement location courte durée',
                ['contract_type' => 'rent', 'type' => 'apartment', 'rent_period' => 'daily'], null],
            '100 000 par mois' => ['100 000 par mois', ['rent_period' => 'monthly', 'price_max' => 100_000], null],
            'surface 200 à 400 m2' => ['terrain entre 200 et 400 m2', ['type' => 'land', 'area_min' => 200, 'area_max' => 400], null],
            'au moins 3 chambres' => ['au moins 3 chambres', ['bedrooms' => 3], null],
            'Médina, deux villes' => ['Médina', ['location' => 'Médina'], null],
            'Médina Saint-Louis' => ['Médina Saint-Louis', ['city' => 'Saint-Louis', 'location' => 'Médina'], null],
            'Pikine est une ville' => ['Pikine', ['city' => 'Pikine'], null],
            // Fautes de frappe d'un mot-clé.
            'apartement' => ['apartement ngor', ['type' => 'apartment', 'city' => 'Dakar', 'location' => 'Ngor'], null],
            'apparte' => ['apparte a louer', ['contract_type' => 'rent', 'type' => 'apartment'], null],
            'terain' => ['terain a vendre', ['contract_type' => 'sale', 'type' => 'land'], null],
            'pisine' => ['villa pisine', ['type' => 'villa', 'tags' => 'Piscine'], null],
            // Casse, accents, ponctuation.
            'MAJUSCULES' => ['VILLA À LOUER, ALMADIES !', ['contract_type' => 'rent', 'type' => 'villa', 'city' => 'Dakar', 'location' => 'Almadies'], null],
            'pluriel' => ['villas a vendre', ['contract_type' => 'sale', 'type' => 'villa'], null],
            // Anglais.
            'en : apartment for rent' => ['2 bedroom apartment for rent in Ngor',
                ['contract_type' => 'rent', 'type' => 'apartment', 'bedrooms' => 2, 'city' => 'Dakar', 'location' => 'Ngor'], null],
            'en : house for sale under 100 million' => ['house for sale under 100 million',
                ['contract_type' => 'sale', 'type' => 'house', 'price_max' => 100_000_000], null],
            // Ce qui reste.
            'villa de luxe' => ['villa de luxe', ['type' => 'villa'], 'luxe'],
            'duplex reste du texte' => ['duplex Almadies', ['city' => 'Dakar', 'location' => 'Almadies'], 'duplex'],
            'grand standing n\'est pas un lieu' => ['appartement grand standing Mermoz',
                ['type' => 'apartment', 'city' => 'Dakar', 'location' => 'Mermoz'], 'grand standing'],
            'deux quartiers : le second reste' => ['Ngor Almadies', ['city' => 'Dakar', 'location' => 'Ngor'], 'Almadies'],
            'année n\'est pas un prix' => ['villa neuve 2024', ['type' => 'villa'], 'neuve 2024'],
            'moins de 3 chambres : aucun paramètre' => ['moins de 3 chambres', [], 'moins de 3 chambres'],
            '3 chambres max' => ['3 chambres max', [], '3 chambres max'],
            'je cherche' => ['je cherche un appartement', ['type' => 'apartment'], null],
            'un numéro n\'est pas un prix' => ['appartement à louer 77 123 45 67',
                ['contract_type' => 'rent', 'type' => 'apartment'], '77 123 45 67'],
            'un numéro collé n\'est pas un prix' => ['villa 771234567 Ngor', ['type' => 'villa', 'city' => 'Dakar', 'location' => 'Ngor'], '771234567'],
            'un montant avant un numéro garde ses groupes' => ['studio 150 000 77 123 45 67',
                ['type' => 'studio', 'price_max' => 150_000], '77 123 45 67'],
            'un numéro groupé par trois derrière un montant' => ['studio 150 000 776 54 32 10',
                ['type' => 'studio', 'price_max' => 150_000], '776 54 32 10'],
            'un numéro derrière un opérateur n\'est pas un prix' => ['studio max 771 23 45 67', ['type' => 'studio'], 'max 771 23 45 67'],
            'des chiffres juxtaposés ne sont pas un prix' => ['studio 150 000 771 234 567', ['type' => 'studio'], '150 000 771 234 567'],
            'l\'étage n\'est pas le début du prix' => ['villa R+1 500 000 F', ['type' => 'villa', 'price_max' => 500_000], 'R+1'],
            'Liberté 6 puis les chambres' => ['Liberté 6 3 chambres', ['bedrooms' => 3, 'city' => 'Dakar', 'location' => 'Liberté 6'], null],
        ];
    }

    /** @param  array<string, mixed>  $criteria */
    #[DataProvider('saisies')]
    public function test_une_saisie_du_marche_devient_des_criteres(string $q, array $criteria, ?string $residue): void
    {
        $r = $this->parse($q);

        $this->assertSame($criteria, $r->criteria, "« {$q} »");
        $this->assertSame($residue, $r->residue, "« {$q} »");
        $this->assertSame($criteria !== [], $r->understood);
    }

    // ───────────────────────────────────────────────────────── rien d'inventé, rien de jeté

    /** @return array<string, array{string}> */
    public static function incomprises(): array
    {
        return [
            'nom de personne' => ['Moussa Ndiaye'],
            'petit nombre' => ['12'],
            'mot proche d\'un mot-clé sans en être un' => ['ville'],
            'comme' => ['comme neuf'],
            'une lettre de différence au début' => ['bonne raison'],
        ];
    }

    #[DataProvider('incomprises')]
    public function test_une_saisie_non_comprise_reste_entiere(string $q): void
    {
        $r = $this->parse($q);

        $this->assertSame([], $r->criteria);
        $this->assertSame([], $r->parts);
        $this->assertSame($q, $r->residue);
        $this->assertFalse($r->understood);
    }

    // ───────────────────────────────────────────────────────── TCK-2476 : les mots vides quittent le résidu

    /** @return array<string, array{string, array<string, mixed>, ?string}> */
    public static function motsVides(): array
    {
        return [
            'je cherche un appartement à almadies' => ['je cherche un appartement à almadies',
                ['type' => 'apartment', 'city' => 'Dakar', 'location' => 'Almadies'], null],
            'je veux une villa à louer' => ['je veux une villa à louer', ['contract_type' => 'rent', 'type' => 'villa'], null],
            'j\'ai besoin d\'un studio svp' => ['j\'ai besoin d\'un studio svp', ['type' => 'studio'], null],
            'recherche maison pour famille' => ['recherche maison pour famille', ['type' => 'house'], 'famille'],
            'i want a flat in ngor' => ['i want a flat in ngor', ['type' => 'apartment', 'city' => 'Dakar', 'location' => 'Ngor'], null],
            'looking for the villa with a view' => ['looking for the villa with a view', ['type' => 'villa'], 'view'],
            'un mot vide entre deux mots gardés' => ['villa de luxe avec vue', ['type' => 'villa'], 'luxe vue'],
        ];
    }

    /** @param  array<string, mixed>  $criteria */
    #[DataProvider('motsVides')]
    public function test_les_mots_d_intention_et_de_liaison_quittent_le_residu(string $q, array $criteria, ?string $residue): void
    {
        $r = $this->parse($q);

        $this->assertSame($criteria, $r->criteria, "« {$q} »");
        $this->assertSame($residue, $r->residue, "« {$q} »");
    }

    public function test_une_saisie_faite_de_mots_vides_n_a_pas_de_residu(): void
    {
        $r = $this->parse('je cherche un');

        $this->assertSame([], $r->criteria);
        $this->assertNull($r->residue);
        $this->assertFalse($r->understood);
    }

    public function test_une_phrase_sans_critere_perd_ses_mots_vides_et_garde_le_reste(): void
    {
        $r = $this->parse('bonjour je voudrais des renseignements');

        $this->assertSame([], $r->criteria);
        $this->assertSame('bonjour renseignements', $r->residue);
        $this->assertFalse($r->understood);
    }

    /** Une phrase gardée entière à dessein (un maximum de chambres, « grand standing ») garde ses mots de liaison. */
    public function test_une_phrase_gardee_entiere_garde_ses_mots_de_liaison(): void
    {
        $this->assertSame('moins de 3 chambres', $this->parse('moins de 3 chambres')->residue);
        $this->assertSame('grand standing', $this->parse('appartement grand standing Mermoz')->residue);
    }

    public function test_une_saisie_vide(): void
    {
        $r = $this->parse("   \t ");

        $this->assertSame([], $r->criteria);
        $this->assertNull($r->residue);
        $this->assertFalse($r->understood);
    }

    // ───────────────────────────────────────────────────────── les parts

    public function test_les_parts_disent_ou_chaque_critere_a_ete_lu(): void
    {
        $q = 'Villa à louer à Sacré-Cœur, piscine';
        $r = $this->parse($q);

        $lus = array_map(
            static fn (array $p): array => [$p['key'], $p['value'], mb_substr($q, $p['from'], $p['to'] - $p['from'])],
            $r->parts,
        );
        $this->assertSame([
            ['type', 'villa', 'Villa'],
            ['contract_type', 'rent', 'à louer'],
            ['location', 'Sacré-Cœur', 'à Sacré-Cœur'],
            ['tags', 'Piscine', 'piscine'],
        ], $lus);
    }

    public function test_une_fourchette_rend_deux_parts_sur_la_meme_phrase(): void
    {
        $q = 'entre 300k et 600k';
        $r = $this->parse($q);

        $this->assertSame([
            ['key' => 'price_min', 'value' => 300_000, 'from' => 0, 'to' => 18],
            ['key' => 'price_max', 'value' => 600_000, 'from' => 0, 'to' => 18],
        ], $r->parts);
    }

    public function test_to_array_est_la_forme_json(): void
    {
        $r = $this->parse('villa Ngor');

        $this->assertSame(['criteria', 'parts', 'residue', 'understood'], array_keys($r->toArray()));
    }

    // ───────────────────────────────────────────────────────── la locale

    public function test_location_est_un_lieu_en_anglais_pas_un_contrat(): void
    {
        $this->assertSame('rent', $this->parse('villa location')->criteria['contract_type'] ?? null);
        $this->assertArrayNotHasKey('contract_type', $this->parse('villa location', 'en')->criteria);
    }

    public function test_sale_n_est_un_contrat_qu_en_anglais(): void
    {
        $this->assertSame('sale', $this->parse('villa sale', 'en')->criteria['contract_type'] ?? null);
        $this->assertArrayNotHasKey('contract_type', $this->parse('villa sale', 'fr')->criteria);
    }

    public function test_le_wolof_lit_le_vocabulaire_francais(): void
    {
        $this->assertSame($this->parse('villa à louer Ngor')->criteria, $this->parse('villa à louer Ngor', 'wo')->criteria);
    }

    // ───────────────────────────────────────────────────────── les conventions du dépôt

    public function test_chaque_equipement_emis_est_un_nom_du_catalogue(): void
    {
        foreach (SearchQueryParser::amenityNames() as $nom) {
            $this->assertContains($nom, TagCatalog::EQUIPEMENTS, $nom);
        }
    }

    public function test_les_cles_des_criteres_sont_les_parametres_publics(): void
    {
        $this->assertSame(
            ['contract_type', 'type', 'rent_period', 'price_min', 'price_max', 'bedrooms', 'area_min', 'area_max', 'furnished', 'city', 'location', 'tags'],
            SearchQueryParser::CRITERIA,
        );
    }

    public function test_studio_est_f1_et_f1_est_zero_chambre(): void
    {
        $this->assertSame(['bedrooms' => 0], $this->parse('F1')->criteria);
        $this->assertSame(['bedrooms' => 1], $this->parse('F2')->criteria);
        $this->assertSame(['bedrooms' => 1], $this->parse('chambre-salon')->criteria);
    }
}
