<?php

namespace Tests\Unit;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\TitleType;
use App\Models\Property;
use App\Support\Search\PropertyLabels;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-506 — les trois champs DÉRIVÉS du document Meilisearch.
 *
 * Tout ici est calculé depuis les colonnes, jamais lu en base : les modèles
 * sont `make()`, pas `create()`. La convention est celle du ticket —
 * **F(n) = chambres + 1, le salon compté** — et le second membre de chaque
 * assertion (« et PAS ceci ») est ce qu'une convention inversée cocherait.
 */
class PropertyLabelsTest extends TestCase
{
    /** @param array<string,mixed> $attributs */
    private function bien(array $attributs): Property
    {
        // `user_id` posé en dur : sans lui, la factory CRÉE un utilisateur en
        // base pour un modèle qu'on ne persiste jamais.
        return Property::factory()->make($attributs + ['user_id' => 1]);
    }

    // ───────────────────────────────────────────── rooms_label

    /** @return array<string,array{0:array<string,mixed>,1:string}> */
    public static function casPieces(): array
    {
        return [
            'studio, quel que soit bedrooms' => [['type' => PropertyType::Studio, 'bedrooms' => 1], 'F1 T1 studio'],
            'appartement 0 chambre' => [['type' => PropertyType::Apartment, 'bedrooms' => 0], 'F1 T1 studio'],
            'appartement 1 chambre' => [['type' => PropertyType::Apartment, 'bedrooms' => 1], 'F2 T2 1 chambre salon'],
            'appartement 3 chambres' => [['type' => PropertyType::Apartment, 'bedrooms' => 3], 'F4 T4 3 chambres salon'],
            'villa 5 chambres' => [['type' => PropertyType::Villa, 'bedrooms' => 5], 'F6 T6 5 chambres salon'],
            'maison sans chambres renseignées' => [['type' => PropertyType::House, 'bedrooms' => null], ''],
            'terrain à 3 chambres (seed défectueux) : rien' => [['type' => PropertyType::Land, 'bedrooms' => 3], ''],
            'entrepôt : rien' => [['type' => PropertyType::Warehouse, 'bedrooms' => 2], ''],
            'chambre seule : rien (le type porte déjà « chambre »)' => [['type' => PropertyType::Room, 'bedrooms' => 1], ''],
        ];
    }

    /** @param array<string,mixed> $attributs */
    #[DataProvider('casPieces')]
    public function test_rooms_label(array $attributs, string $attendu): void
    {
        $this->assertSame($attendu, PropertyLabels::rooms($this->bien($attributs)));
    }

    /**
     * Un document habitable ne porte qu'UN chiffre nu : celui des chambres
     * (la surface mise à part — « 95 » ne répond qu'à `q=95 chambres`).
     * C'est ce qui garde la précision de « N chambres » (cf. PropertyLabels).
     *
     * « R+2 » est l'EXCEPTION nommée : pour le moteur ce n'est un jeton entier
     * que par le dictionnaire de l'index ; la regex l'exclut donc du compte
     * (`+` dans le lookbehind), et `PropertySearchableArrayTest` garde que le
     * dictionnaire couvre chaque R+n émis. Sans le dictionnaire, la villa
     * ci-dessous répondrait à `q=2 chambres` (mesuré le 2026-09-02).
     */
    public function test_un_document_habitable_ne_porte_que_le_chiffre_des_chambres(): void
    {
        $appart = $this->bien(['type' => PropertyType::Apartment, 'bedrooms' => 3, 'bathrooms' => 2, 'floor_number' => 4, 'area' => 95]);
        $villa = $this->bien(['type' => PropertyType::Villa, 'bedrooms' => 5, 'bathrooms' => 3, 'total_floors' => 2, 'area' => 300]);

        foreach ([[$appart, ['3', '95']], [$villa, ['5', '300']]] as [$bien, $attendu]) {
            $texte = PropertyLabels::rooms($bien).' '.PropertyLabels::facts($bien);
            preg_match_all('/(?<![\w.+])\d+(?![\w.])/', $texte, $m);
            $this->assertSame($attendu, $m[0], $texte);
        }

        $this->assertStringContainsString('R+2', PropertyLabels::facts($villa));
    }

    public function test_un_nombre_de_chambres_en_chaine_reste_un_entier(): void
    {
        $this->assertSame('F1 T1 studio', PropertyLabels::rooms($this->bien(['type' => PropertyType::Apartment, 'bedrooms' => '0'])));
        $this->assertSame('F4 T4 3 chambres salon', PropertyLabels::rooms($this->bien(['type' => PropertyType::Apartment, 'bedrooms' => '3'])));
    }

    /** Au-delà de ce que le dictionnaire couvre, rien : « R+10 » pour 25 niveaux serait un fait faux indexé. */
    public function test_au_dela_des_niveaux_couverts_aucun_etage_nest_emis(): void
    {
        $tour = $this->bien(['type' => PropertyType::Villa, 'bedrooms' => 2, 'total_floors' => 25]);
        $plafond = $this->bien(['type' => PropertyType::Villa, 'bedrooms' => 2, 'total_floors' => PropertyLabels::NIVEAUX_MAX]);

        $this->assertStringNotContainsString('R+', PropertyLabels::facts($tour));
        $this->assertStringNotContainsString('R+', PropertyLabels::title($tour, null));
        $this->assertStringContainsString('R+'.PropertyLabels::NIVEAUX_MAX, PropertyLabels::facts($plafond));
        $this->assertStringContainsString('R+'.PropertyLabels::NIVEAUX_MAX, PropertyLabels::title($plafond, null));
    }

    public function test_f4_designe_trois_chambres_et_jamais_quatre(): void
    {
        $trois = PropertyLabels::rooms($this->bien(['type' => PropertyType::Apartment, 'bedrooms' => 3]));
        $quatre = PropertyLabels::rooms($this->bien(['type' => PropertyType::Apartment, 'bedrooms' => 4]));

        $this->assertMatchesRegularExpression('/\bF4\b/', $trois);
        $this->assertDoesNotMatchRegularExpression('/\bF4\b/', $quatre);
        $this->assertMatchesRegularExpression('/\bF5\b/', $quatre);
    }

    // ───────────────────────────────────────────── facts_label

    /** @return array<string,array{0:array<string,mixed>,1:list<string>,2:list<string>}> */
    public static function casFaits(): array
    {
        $vide = ['area' => null, 'bathrooms' => null, 'parking_spaces' => null, 'total_floors' => null,
            'floor_number' => null, 'title_type' => null, 'rent_period' => null, 'year_built' => null,
            'contract_type' => ContractType::Sale];

        return [
            'villa R+1' => [['type' => PropertyType::Villa, 'total_floors' => 1] + $vide, ['R+1'], ['villa basse', 'R 1']],
            'villa de plain-pied' => [['type' => PropertyType::Villa, 'total_floors' => 0] + $vide, ['R+0', 'villa basse plain-pied'], []],
            'appartement : jamais de R+n' => [['type' => PropertyType::Apartment, 'total_floors' => 4] + $vide, [], ['R+4']],
            'appartement au rez-de-chaussée' => [['type' => PropertyType::Apartment, 'floor_number' => 0] + $vide, ['rez-de-chaussee rdc'], ['etage']],
            'bureau au 3e' => [['type' => PropertyType::Office, 'floor_number' => 3] + $vide, ['3e etage 3eme etage'], ['rdc', ' 3 ']],
            'villa : pas d\'étage' => [['type' => PropertyType::Villa, 'floor_number' => 2] + $vide, [], ['etage']],
            '2 salles de bain' => [['type' => PropertyType::House, 'bathrooms' => 2] + $vide, ['sdb salle de bain salles de bain'], ['2 sdb']],
            'sdb sur un bureau : rien' => [['type' => PropertyType::Office, 'bathrooms' => 2] + $vide, [], ['sdb']],
            'parking' => [['type' => PropertyType::Shop, 'parking_spaces' => 2] + $vide, ['parking garage'], []],
            'zéro parking' => [['type' => PropertyType::Shop, 'parking_spaces' => 0] + $vide, [], ['parking']],
            'surface' => [['type' => PropertyType::Land, 'area' => 300] + $vide, ['300 m2'], ['ha']],
            'surface en hectares' => [['type' => PropertyType::Farm, 'area' => 15000] + $vide, ['15000 m2', '1.5 ha hectare'], []],
            'deux hectares ronds' => [['type' => PropertyType::Land, 'area' => 20000] + $vide, ['2 ha hectare'], ['2.0']],
            'titre foncier' => [['type' => PropertyType::Land, 'title_type' => TitleType::TitreFoncier] + $vide, ['titre foncier TF'], ['bail']],
            'bail' => [['type' => PropertyType::House, 'title_type' => TitleType::Bail] + $vide, ['bail'], ['TF']],
            'délibération' => [['type' => PropertyType::Farm, 'title_type' => TitleType::Deliberation] + $vide, ['deliberation'], []],
            'statut « autre » : rien' => [['type' => PropertyType::Land, 'title_type' => TitleType::Autre] + $vide, [], ['autre']],
            'statut foncier sur un appartement : rien' => [['type' => PropertyType::Apartment, 'title_type' => TitleType::TitreFoncier] + $vide, [], ['TF']],
            'location journalière' => [['type' => PropertyType::Studio, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Daily] + $vide, ['par jour journalier courte duree'], ['mensuel']],
            'location mensuelle' => [['type' => PropertyType::Studio, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly] + $vide, ['par mois mensuel'], ['journalier']],
            'location hebdomadaire' => [['type' => PropertyType::Studio, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Weekly] + $vide, ['par semaine hebdomadaire'], []],
            'location annuelle' => [['type' => PropertyType::Studio, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Yearly] + $vide, ['par an annuel'], []],
            'période sur une vente : rien' => [['type' => PropertyType::Studio, 'contract_type' => ContractType::Sale, 'rent_period' => RentPeriod::Monthly] + $vide, [], ['mensuel']],
        ];
    }

    /**
     * @param  array<string,mixed>  $attributs
     * @param  list<string>  $present
     * @param  list<string>  $absent
     */
    #[DataProvider('casFaits')]
    public function test_facts_label(array $attributs, array $present, array $absent): void
    {
        $label = PropertyLabels::facts($this->bien($attributs));

        foreach ($present as $jeton) {
            $this->assertStringContainsString($jeton, $label, "« {$jeton} » manque dans « {$label} »");
        }
        foreach ($absent as $jeton) {
            $this->assertStringNotContainsString($jeton, $label, "« {$jeton} » ne devrait pas être dans « {$label} »");
        }
    }

    public function test_neuf_designe_l_annee_courante_ou_la_precedente(): void
    {
        Carbon::setTestNow('2030-06-01');

        try {
            $this->assertStringContainsString('neuf', PropertyLabels::facts($this->bien(['year_built' => 2030])));
            $this->assertStringContainsString('neuf', PropertyLabels::facts($this->bien(['year_built' => 2029])));
            $this->assertStringNotContainsString('neuf', PropertyLabels::facts($this->bien(['year_built' => 2028])));
            $this->assertStringNotContainsString('neuf', PropertyLabels::facts($this->bien(['year_built' => null])));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_un_bien_sans_aucun_fait_rend_une_chaine_vide_sans_espace(): void
    {
        $label = PropertyLabels::facts($this->bien([
            'type' => PropertyType::Other, 'area' => null, 'bathrooms' => null, 'parking_spaces' => null,
            'total_floors' => null, 'floor_number' => null, 'title_type' => null, 'rent_period' => null,
            'year_built' => null, 'contract_type' => ContractType::Sale,
        ]));

        $this->assertSame('', $label);
    }

    public function test_les_jetons_sont_separes_par_une_seule_espace(): void
    {
        $label = PropertyLabels::facts($this->bien([
            'type' => PropertyType::Villa, 'area' => 400, 'bathrooms' => 3, 'parking_spaces' => 1,
            'total_floors' => 2, 'title_type' => TitleType::TitreFoncier, 'year_built' => 1990,
            'contract_type' => ContractType::Sale,
        ]));

        $this->assertDoesNotMatchRegularExpression('/\s{2}|^\s|\s$/', $label);
    }

    // ───────────────────────────────────────────── derived_title

    private function adresse(?string $quartier, ?string $ville): Address
    {
        return new Address(['neighborhood' => $quartier, 'city' => $ville]);
    }

    public function test_titre_derive_dun_appartement(): void
    {
        $bien = $this->bien(['type' => PropertyType::Apartment, 'bedrooms' => 3, 'furnished' => false, 'total_floors' => 5]);

        $this->assertSame(
            'Appartement F4 à Médina, Dakar',
            PropertyLabels::title($bien, $this->adresse('Médina', 'Dakar')),
        );
    }

    public function test_titre_derive_meuble_et_villa_a_etage(): void
    {
        $villa = $this->bien(['type' => PropertyType::Villa, 'bedrooms' => 4, 'furnished' => true, 'total_floors' => 1]);

        $this->assertSame('Villa F5 meublée R+1 à Saly, Mbour', PropertyLabels::title($villa, $this->adresse('Saly', 'Mbour')));
    }

    public function test_titre_derive_dun_studio_ne_repete_pas_f1(): void
    {
        $studio = $this->bien(['type' => PropertyType::Studio, 'bedrooms' => 1, 'furnished' => false, 'total_floors' => null]);

        $this->assertSame('Studio à Mermoz, Dakar', PropertyLabels::title($studio, $this->adresse('Mermoz', 'Dakar')));
    }

    public function test_titre_derive_dune_chambre(): void
    {
        $chambre = $this->bien(['type' => PropertyType::Room, 'bedrooms' => 1, 'furnished' => true, 'total_floors' => null]);

        $this->assertSame('Chambre meublée à Fann, Dakar', PropertyLabels::title($chambre, $this->adresse('Fann', 'Dakar')));
    }

    public function test_titre_derive_dun_terrain(): void
    {
        $terrain = $this->bien(['type' => PropertyType::Land, 'area' => 300, 'title_type' => TitleType::TitreFoncier, 'bedrooms' => 3]);

        $this->assertSame(
            'Terrain 300 m² titre foncier à Keur Massar, Dakar',
            PropertyLabels::title($terrain, $this->adresse('Keur Massar', 'Dakar')),
        );
    }

    public function test_titre_derive_dune_ferme_en_bail_sans_quartier(): void
    {
        $ferme = $this->bien(['type' => PropertyType::Farm, 'area' => 20000, 'title_type' => TitleType::Bail]);

        $this->assertSame('Ferme 20000 m² bail à Thiès', PropertyLabels::title($ferme, $this->adresse(null, 'Thiès')));
    }

    public function test_titre_derive_dun_bureau_sans_adresse(): void
    {
        $bureau = $this->bien(['type' => PropertyType::Office, 'area' => 120, 'bedrooms' => 2, 'title_type' => TitleType::TitreFoncier]);

        $this->assertSame('Bureau 120 m²', PropertyLabels::title($bureau, null));
    }

    public function test_titre_derive_avec_quartier_seul(): void
    {
        $bien = $this->bien(['type' => PropertyType::Shop, 'area' => null]);

        $this->assertSame('Commerce à Plateau', PropertyLabels::title($bien, $this->adresse('Plateau', null)));
    }

    public function test_titre_derive_sans_chambres_ni_surface(): void
    {
        $maison = $this->bien(['type' => PropertyType::House, 'bedrooms' => null, 'furnished' => false, 'total_floors' => null]);

        $this->assertSame('Maison à Dakar', PropertyLabels::title($maison, $this->adresse(null, 'Dakar')));
    }

    public function test_le_libelle_de_type_est_lu_dans_lang_fr(): void
    {
        foreach (PropertyType::cases() as $type) {
            $titre = PropertyLabels::title($this->bien(['type' => $type, 'bedrooms' => null, 'area' => null, 'furnished' => false, 'total_floors' => null, 'title_type' => null]), null);
            $this->assertSame(trans("properties.type.{$type->value}", [], 'fr'), $titre, "type {$type->value}");
        }
    }

    // ───────────────────────────────────────────── familles

    public function test_la_table_des_familles_couvre_exactement_les_types(): void
    {
        $attendu = array_map(fn (PropertyType $c) => $c->value, PropertyType::cases());
        $cles = array_keys(PropertyLabels::FAMILLES);
        sort($attendu);
        sort($cles);

        $this->assertSame($attendu, $cles);
        $this->assertSame(
            [],
            array_diff(array_unique(array_values(PropertyLabels::FAMILLES)), [
                PropertyLabels::FAMILLE_HABITATION, PropertyLabels::FAMILLE_FONCIER, PropertyLabels::FAMILLE_PROFESSIONNEL,
            ]),
        );
    }
}
