<?php

namespace Database\Seeders\Support;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Database\Seeders\Catalog\PropertySeeder;
use Faker\Provider\Base;

/**
 * Faker provider with Senegalese flavour used to make the seed data more
 * realistic (names, phone prefixes, Dakar neighbourhoods, cities).
 */
class SenegalFakerProvider extends Base
{
    /** Quartiers de Dakar avec leurs caractéristiques de prix */
    protected static $neighborhoods = [
        'Almadies' => ['type' => 'residential', 'rent' => [2500000, 8000000], 'sale' => [150000000, 500000000]],
        'Mermoz' => ['type' => 'residential', 'rent' => [2000000, 6000000], 'sale' => [120000000, 350000000]],
        'Plateau' => ['type' => 'mixed', 'rent' => [1500000, 4000000], 'sale' => [100000000, 300000000]],
        'Point E' => ['type' => 'residential', 'rent' => [1800000, 5000000], 'sale' => [100000000, 280000000]],
        'Fann' => ['type' => 'residential', 'rent' => [1500000, 4500000], 'sale' => [80000000, 250000000]],
        'Ouakam' => ['type' => 'mixed', 'rent' => [1200000, 3500000], 'sale' => [70000000, 200000000]],
        'Yoff' => ['type' => 'mixed', 'rent' => [1000000, 3000000], 'sale' => [60000000, 180000000]],
        'Liberté 6' => ['type' => 'residential', 'rent' => [1500000, 4000000], 'sale' => [90000000, 220000000]],
        'Sicap Baobab' => ['type' => 'residential', 'rent' => [800000, 2500000], 'sale' => [50000000, 150000000]],
        'HLM' => ['type' => 'residential', 'rent' => [500000, 1500000], 'sale' => [30000000, 100000000]],
        'Grand-Yoff' => ['type' => 'mixed', 'rent' => [400000, 1200000], 'sale' => [25000000, 80000000]],
        'Parcelles Assainies' => ['type' => 'residential', 'rent' => [300000, 1000000], 'sale' => [20000000, 60000000]],
        'Pikine' => ['type' => 'mixed', 'rent' => [250000, 800000], 'sale' => [15000000, 50000000]],
        'Guédiawaye' => ['type' => 'mixed', 'rent' => [200000, 700000], 'sale' => [12000000, 40000000]],
        'Dieuppeul' => ['type' => 'residential', 'rent' => [600000, 1800000], 'sale' => [35000000, 120000000]],
        'Amitié' => ['type' => 'residential', 'rent' => [700000, 2000000], 'sale' => [40000000, 130000000]],
        'Ngor' => ['type' => 'residential', 'rent' => [1000000, 3000000], 'sale' => [60000000, 200000000]],
        'Hann Maristes' => ['type' => 'industrial', 'rent' => [500000, 1500000], 'sale' => [40000000, 120000000]],
        'Ouest Foire' => ['type' => 'commercial', 'rent' => [800000, 2500000], 'sale' => [50000000, 180000000]],
        'Cité Keur Gorgui' => ['type' => 'residential', 'rent' => [600000, 2000000], 'sale' => [40000000, 140000000]],
    ];

    /**
     * Templates de titres de propriétés.
     *
     * ⚠ AUCUN gabarit ne dit « meublé », et c'est une CONTRAINTE, pas un oubli
     * (TCK-335, étape 7). Trois d'entre eux le disaient — « Appartement meublé
     * F{bedrooms} », « Studio meublé », « Pièce meublée » — alors que la colonne
     * `furnished` est tirée INDÉPENDAMMENT par {@see PropertySeeder},
     * après le titre. Mesuré sur le jeu du 2026-08-21 : **12 des 21 biens publics
     * dont le titre disait « meublé » portaient `furnished = false`** — 57 % de
     * contradictions. Toute mesure de `q=meublé` jugeait donc une donnée fausse,
     * et l'assertion « q=meublé ≈ furnished=1 » était inatteignable.
     *
     * Ce provider ne peut pas RENDRE le gabarit vrai : il reçoit le type, le
     * nombre de chambres et le quartier, jamais `furnished`. Il s'interdit donc
     * de l'écrire. Le chemin du mot « meublé » vers les biens meublés passe
     * désormais par `furnished_label` ({@see Property::toSearchableArray()}),
     * un champ DÉRIVÉ de la colonne, qui ne peut pas la contredire.
     */
    protected static $propertyTitleTemplates = [
        PropertyType::Apartment->value => [
            'Appartement F{rooms} à {neighborhood}',
            'Studio moderne à {neighborhood}',
            'Bel appartement {bedrooms} chambres - {neighborhood}',
            'Résidence F{rooms} avec ascenseur - {neighborhood}',
            'Appartement lumineux F{rooms} à {neighborhood}',
        ],
        PropertyType::House->value => [
            'Villa moderne à {neighborhood}',
            'Maison familiale {bedrooms} chambres - {neighborhood}',
            'Belle villa avec piscine à {neighborhood}',
            'Maison de standing à {neighborhood}',
            'Villa contemporaine {bedrooms} chambres - {neighborhood}',
        ],
        PropertyType::Studio->value => [
            'Studio économique à {neighborhood}',
            'Studio rénové à {neighborhood}',
            'Petit studio à {neighborhood}',
            'Studio moderne à {neighborhood}',
        ],
        PropertyType::Villa->value => [
            'Villa luxueuse à {neighborhood}',
            'Superbe villa {bedrooms} chambres - {neighborhood}',
            'Villa avec jardin à {neighborhood}',
            'Villa familiale standing à {neighborhood}',
        ],
        PropertyType::Shop->value => [
            'Boutique commerciale à {neighborhood}',
            'Local commercial à {neighborhood}',
            'Espace commercial à {neighborhood}',
        ],
        PropertyType::Office->value => [
            'Bureau professionnel à {neighborhood}',
            'Espace de bureau à {neighborhood}',
            'Bureaux à {neighborhood}',
        ],
        PropertyType::Warehouse->value => [
            'Entrepôt à {neighborhood}',
            'Hangar à {neighborhood}',
            'Espace de stockage à {neighborhood}',
        ],
        PropertyType::Land->value => [
            'Terrain à {neighborhood}',
            'Parcelle à {neighborhood}',
            'Terrain viabilisé à {neighborhood}',
        ],
        PropertyType::Room->value => [
            'Chambre à louer à {neighborhood}',
            'Pièce indépendante à {neighborhood}',
        ],
        PropertyType::Garage->value => [
            'Garage à {neighborhood}',
            'Parking couvert à {neighborhood}',
        ],
    ];

    /** Templates de descriptions */
    protected static $descriptionTemplates = [
        'Situé dans un quartier {neighborhood_quality}, cette propriété offre {features}. Idéal pour {ideal_for}.',
        'Magnifique bien situé à {neighborhood}. {features}. Parfait pour {ideal_for}.',
        'Propriété de qualité dans le quartier recherché de {neighborhood}. {features}. Convient parfaitement à {ideal_for}.',
        'Belle opportunité à {neighborhood}. {features}. Idéal pour {ideal_for}.',
        'Charmant bien situé à {neighborhood} dans un environnement {neighborhood_quality}. {features}.',
    ];

    /** Caractéristiques de quartiers */
    protected static $neighborhoodQualities = [
        'calme et résidentiel', 'prisé', 'sécurisé', 'familial', 'animé',
        'recherché', 'résidentiel', 'commerçant', 'bien desservi',
    ];

    /** Caractéristiques possibles */
    protected static $propertyFeatures = [
        'proximité des commerces et écoles',
        'accès facile au transport en commun',
        'quartier calme et sécurisé',
        'proche des commodités',
        'voies d\'accès asphaltées',
        'eau et électricité disponibles',
        'environnement verdoyant',
        'proche du centre-ville',
        'accès à internet haut débit',
        'quartier résidentiel de standing',
    ];

    /** Idéal pour... */
    protected static $idealFor = [
        'une famille', 'un couple', 'des étudiants', 'des professionnels',
        'une petite entreprise', 'un investisseur', 'une première acquisition',
        'une location saisonnière', 'un usage commercial',
    ];

    protected static $firstNames = [
        'Mouhamed', 'Cheikh', 'Ibrahima', 'Moustapha', 'Abdoulaye', 'Ousmane',
        'Modou', 'Mamadou', 'Aliou', 'Malick', 'Fallou', 'Serigne', 'Pape',
        'Aïssatou', 'Awa', 'Fatou', 'Khady', 'Ndeye', 'Aminata', 'Mariama',
        'Bineta', 'Coumba', 'Sokhna', 'Yacine', 'Astou', 'Oumy', 'Rokhaya',
    ];

    protected static $lastNames = [
        'Diop', 'Ndiaye', 'Fall', 'Sarr', 'Sow', 'Ba', 'Diallo', 'Gueye',
        'Sy', 'Mbaye', 'Thiam', 'Cissé', 'Seck', 'Niang', 'Faye', 'Kane',
        'Sene', 'Diouf', 'Dieng', 'Wade', 'Ndoye', 'Samb', 'Toure',
    ];

    protected static $dakarNeighborhoods = [
        'Plateau', 'Almadies', 'Mermoz', 'Sacré-Cœur', 'Fann', 'Ouakam',
        'Yoff', 'Ngor', 'Point E', 'Liberté 6', 'Sicap Baobab', 'HLM',
        'Parcelles Assainies', 'Grand-Yoff', 'Dieupeul', 'Amitié',
        'Hann Maristes', 'Ouest Foire', 'Cité Keur Gorgui',
    ];

    protected static $cities = [
        'Dakar', 'Thiès', 'Saint-Louis', 'Rufisque', 'Mbour', 'Kaolack',
        'Ziguinchor', 'Touba', 'Diourbel', 'Louga',
    ];

    protected static $phonePrefixes = ['77', '78', '76', '70', '75'];

    public function senegaleseFirstName(): string
    {
        return static::randomElement(static::$firstNames);
    }

    public function senegaleseLastName(): string
    {
        return static::randomElement(static::$lastNames);
    }

    public function senegalesePhoneNumber(): string
    {
        $prefix = static::randomElement(static::$phonePrefixes);

        return '+221'.$prefix.static::numerify('#######');
    }

    public function senegaleseLandline(): string
    {
        return '+22133'.static::numerify('#######');
    }

    public function dakarNeighborhood(): string
    {
        return static::randomElement(static::$dakarNeighborhoods);
    }

    public function senegaleseCity(): string
    {
        return static::randomElement(static::$cities);
    }

    /**
     * Génère un titre de propriété réaliste pour le Sénégal.
     */
    public function senegalesePropertyTitle(PropertyType $type, int $bedrooms, string $neighborhood): string
    {
        $templates = static::$propertyTitleTemplates[$type->value] ??
                     static::$propertyTitleTemplates[PropertyType::Apartment->value];

        $template = static::randomElement($templates);

        // TCK-506 — F(n) = chambres + 1, le salon compté : « Appartement F4 »
        // a TROIS chambres. Les gabarits écrivaient `F{bedrooms}` — F4 pour
        // 4 chambres —, l'inverse de la convention que `PropertyLabels` indexe,
        // et un jeu de démonstration qui contredit l'index rend toute mesure
        // de `q=F4` ininterprétable.
        return str_replace(
            ['{rooms}', '{bedrooms}', '{neighborhood}'],
            [$bedrooms + 1, $bedrooms, $neighborhood],
            $template
        );
    }

    /**
     * Génère une description de propriété réaliste.
     */
    public function senegalesePropertyDescription(string $neighborhood): string
    {
        $template = static::randomElement(static::$descriptionTemplates);
        $quality = static::randomElement(static::$neighborhoodQualities);
        $features = static::randomElement(static::$propertyFeatures);
        $ideal = static::randomElement(static::$idealFor);

        return str_replace(
            ['{neighborhood}', '{neighborhood_quality}', '{features}', '{ideal_for}'],
            [$neighborhood, $quality, $features, $ideal],
            $template
        );
    }

    /**
     * Retourne les caractéristiques d'un quartier (prix, type).
     *
     * @return array<string, mixed>
     */
    public function senegaleseNeighborhoodData(): array
    {
        $neighborhood = static::randomElement(array_keys(static::$neighborhoods));

        return array_merge(
            ['name' => $neighborhood],
            static::$neighborhoods[$neighborhood]
        );
    }

    /**
     * Génère un prix réaliste selon le type de contrat et le quartier.
     *
     * @return array{price: int, neighborhood: string}
     */
    public function senegalesePrice(ContractType $type, ?string $neighborhood = null): array
    {
        if ($neighborhood === null) {
            $neighborhood = static::randomElement(array_keys(static::$neighborhoods));
        }

        $data = static::$neighborhoods[$neighborhood];
        $range = $type === ContractType::Rent ? $data['rent'] : $data['sale'];

        $price = random_int($range[0], $range[1]);

        // Arrondir pour plus de réalisme
        if ($type === ContractType::Rent) {
            $price = (int) (round($price / 10000) * 10000); // Arrondir à 10 000
        } else {
            $price = (int) (round($price / 1000000) * 1000000); // Arrondir au million
        }

        return ['price' => $price, 'neighborhood' => $neighborhood];
    }

    /**
     * Retourne la liste des quartiers disponibles.
     *
     * @return array<string>
     */
    public static function getNeighborhoods(): array
    {
        return array_keys(static::$neighborhoods);
    }
}
