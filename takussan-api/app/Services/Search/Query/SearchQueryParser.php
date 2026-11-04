<?php

namespace App\Services\Search\Query;

use App\Models\Property;
use App\Services\Radar\RadarAmountParser;
use App\Services\Tags\TagCatalog;
use App\Support\CaseInsensitive;
use App\Support\PhoneMasker;
use App\Support\RadarPhone;
use App\Support\Search\CleDeQuartier;
use App\Support\Search\PropertyLabels;
use Illuminate\Support\Str;

/**
 * TCK-2473 (ADR-0088) — la saisie libre de la recherche publique, lue comme on la dit : « appart 3ch Almadies moins
 * de 500k » devient `type=apartment`, `bedrooms=3`, `location=Almadies`, `city=Dakar`, `price_max=500000`.
 *
 * Sans base, sans réseau, déterministe : les lieux viennent du {@see PlaceLexicon} injecté, les variantes d'écriture
 * d'un type ou d'un terme (TCK-2476) des {@see VocabularyAliases} injectées — lues comme les phrases du vocabulaire.
 *
 * **Les conventions du dépôt, pas de nouvelles** (re-mesurées le 2026-11-04, notes du ticket) :
 *   - `bedrooms` est un MINIMUM côté API (`bedrooms >= n`, TCK-633) : le parseur n'émet que des minimums, et une saisie
 *     qui borne les chambres par le haut (« moins de 3 chambres », « 3 chambres max ») reste entière dans `residue` ;
 *   - F(n) = T(n) = chambres + 1, « chambre salon » = F2 = 1 chambre, n pièces = n − 1 chambres
 *     ({@see PropertyLabels}) ;
 *   - les montants se lisent par {@see RadarAmountParser} (« 1M5 », « 450.000f », « 500k », « 2 millions ») ;
 *   - les types reprennent `lang/{fr,en}/properties.php` et {@see Property::TYPE_SEARCH_ALIASES} ;
 *     `immeuble` → `other` comme le Radar (`ReadsListHtml`) ; aucun mot wolof (la table wolof est vide, TCK-339) ;
 *   - les équipements sont les noms de {@see TagCatalog::EQUIPEMENTS}, que le filtre `tags` compare.
 *
 * **Rien d'inventé, rien de jeté.** Un mot non compris va dans `residue`. Un mot de liaison (« à », « avec », « de »…)
 * n'est absorbé que devant ce qui a été compris : « maison de ma tante » rend `type=house` et « de ma tante ».
 * Un second lieu, un second contrat contradictoire, retournent au résidu : un critère d'URL n'a qu'une valeur.
 *
 * Tolérances : casse, accents, ponctuation, pluriel, et la faute de frappe d'un MOT-CLÉ (pas d'un lieu : TCK-2476)
 * — une lettre (deux au-delà de neuf lettres) sur un mot-clé d'au moins six lettres qui commence pareil, ou un début
 * de mot-clé d'au moins six lettres (« apparte »), quand il ne désigne qu'une seule chose.
 */
final class SearchQueryParser
{
    /** Les paramètres d'URL publics que le parseur émet, dans l'ordre des critères rendus. */
    public const CRITERIA = [
        'contract_type', 'type', 'rent_period', 'price_min', 'price_max', 'bedrooms',
        'area_min', 'area_max', 'furnished', 'city', 'location', 'tags',
    ];

    /** Au-delà, les mots restent au résidu sans être lus : une saisie de recherche n'est pas un texte. */
    private const MAX_TOKENS = 40;

    /** Un nombre nu sans marque (ni groupement, ni multiplicateur, ni monnaie, ni opérateur) en dessous : une année, un numéro, pas un prix. */
    private const BARE_PLAIN_MIN = 10_000;

    /**
     * Au-delà de mille milliards de XOF, ce n'est plus un prix mais des chiffres juxtaposés (« 150 000 771 234 567 » :
     * un prix suivi d'un numéro groupé par trois que le masquage ne voit pas). `RadarAmountParser` s'arrête à 15 chiffres.
     */
    private const MAX_PRICE = 1_000_000_000_000;

    /**
     * Le plus grand nombre de chambres que la liste accepte (`SearchPublicPropertyRequest`, `bedrooms` : `max:50`). Au-delà,
     * « 150 chambres » n'est ni un compte (la liste rendrait 422) ni le type chambre : la phrase reste au résidu.
     */
    private const MAX_BEDROOMS = 50;

    /**
     * Revue adverse n° 4 (2026-11-04) — « sans piscine », « pas de clim », « without pool » : l'équipement nié n'est PAS
     * un critère (le filtre `tags` exigerait la piscine), ni un mot à chercher (le texte « piscine » ramènerait les biens
     * qui en ont une). La phrase est lue, et n'émet rien. `pas` n'est une négation que devant un équipement.
     */
    private const NEGATIONS = ['sans', 'pas', 'without', 'no'];

    /** L'article qui peut suivre la négation : « sans LA piscine », « pas D'ascenseur », « without A pool ». */
    private const NEGATED_ARTICLES = ['de', 'd', 'le', 'la', 'les', 'l', 'un', 'une', 'the', 'a', 'any'];

    /**
     * Revue adverse n° 10 — un type qui n'est pas un logement : « vide » d'un terrain veut dire nu ou libre, pas « non
     * meublé », et l'ameublement n'en filtre rien. Seuls, ces types n'émettent pas `furnished`.
     */
    private const NOT_FURNISHABLE = ['land', 'parking', 'garage'];

    /** Mots de liaison : absorbés seulement devant ce qui a été compris (au plus deux d'affilée). */
    private const CONNECTORS = [
        'a', 'au', 'aux', 'en', 'de', 'du', 'des', 'd', 'avec', 'with', 'in', 'at', 'sur', 'pour', 'for',
        'un', 'une', 'le', 'la', 'les', 'l', 'the', 'an', 'et', 'and', 'ou', 'or', 'dans',
    ];

    private const WITH = ['avec', 'with'];

    /**
     * TCK-2476 — mots d'intention et de liaison qui quittent le RÉSIDU : « je cherche un appartement à almadies » ne
     * laisse rien à chercher en texte (sinon la liste cherche « je cherche un » et le compte tombe à zéro). Liste courte
     * et FERMÉE, français et anglais. Un mot compris (« à louer ») n'est déjà plus au résidu ; une phrase gardée entière
     * à dessein (« moins de 3 chambres », « grand standing ») garde les siens. Un résidu fait de mots vides est `null`.
     */
    private const STOPWORDS = [
        'je', 'j', 'ai', 'cherche', 'recherche', 'veux', 'voudrais', 'souhaite', 'besoin', 'svp', 'stp',
        'un', 'une', 'des', 'le', 'la', 'les', 'de', 'du', 'd', 'l', 'a', 'au', 'aux', 'en', 'pour', 'avec', 'sur', 'dans',
        'et', 'ou',
        'i', 'want', 'need', 'looking', 'search', 'please', 'for', 'an', 'the', 'in', 'with', 'of', 'at', 'and', 'or',
    ];

    /** Type → écritures. Les alias français sont ceux de `Property::TYPE_SEARCH_ALIASES` (sauf `autre`, mot courant). */
    private const TYPES = [
        'apartment' => ['appartement', 'appart', 'appt', 'apartment', 'flat'],
        'house' => ['maison', 'house'],
        'villa' => ['villa'],
        'studio' => ['studio'],
        'room' => ['chambre', 'colocation', 'room'],
        'land' => ['terrain', 'parcelle', 'lot', 'land', 'plot'],
        'office' => ['bureau', 'office'],
        'shop' => ['boutique', 'magasin', 'commerce', 'local commercial', 'local', 'shop', 'store'],
        'warehouse' => ['entrepot', 'depot', 'hangar', 'warehouse'],
        'factory' => ['usine', 'factory'],
        'farm' => ['ferme', 'verger', 'farm'],
        'hotel' => ['hotel', 'auberge', 'lodge', 'campement'],
        'resort' => ['resort'],
        'garage' => ['garage'],
        'parking' => ['parking'],
        'other' => ['immeuble'],
    ];

    private const CONTRACTS = [
        'rent' => ['louer', 'location', 'loyer', 'rent', 'rental', 'for rent', 'to rent'],
        'sale' => ['vendre', 'vente', 'acheter', 'achat', 'for sale', 'sale', 'buy', 'purchase', 'to buy'],
    ];

    /** Les écritures de `PropertyLabels::PERIODE` et de `RadarAmountParser`, en phrases. */
    private const PERIODS = [
        'monthly' => ['par mois', '/ mois', 'mensuel', 'mensuelle', 'le mois', 'per month', 'a month', '/ month', 'monthly'],
        'daily' => ['par jour', '/ jour', '/ j', 'journalier', 'la nuit', 'par nuit', '/ nuit', 'nuit', 'nuitee', 'la nuitee',
            'courte duree', 'per night', 'per day', 'a night', 'daily', 'nightly', 'night'],
        'weekly' => ['par semaine', '/ semaine', 'hebdomadaire', 'hebdo', 'per week', 'weekly'],
        'yearly' => ['par an', '/ an', 'par annee', 'annuel', 'annuelle', 'per year', 'yearly', 'annual'],
    ];

    /** `equipe` : le vocabulaire d'ameublement indexé (`Property::FURNISHED_SEARCH_LABEL`). */
    private const FURNISHED = [
        'true' => ['meuble', 'meublee', 'equipe', 'equipee', 'tout equipe', 'furnished'],
        'false' => ['non meuble', 'non meublee', 'pas meuble', 'pas meublee', 'sans meuble', 'vide', 'unfurnished', 'not furnished'],
    ];

    /** Nom du catalogue (`TagCatalog::EQUIPEMENTS`) → écritures. `Parking` et `Garage` passent par les types (voir `parse()`). */
    private const AMENITIES = [
        'Piscine' => ['piscine', 'pool', 'swimming pool'],
        'Climatisation' => ['climatisation', 'clim', 'climatise', 'climatisee', 'air conditionne', 'air conditioning', 'aircon'],
        'Ascenseur' => ['ascenseur', 'elevator', 'lift'],
        'Balcon' => ['balcon', 'balcony'],
        'Terrasse' => ['terrasse', 'terrace'],
        'Toit-terrasse' => ['toit terrasse', 'rooftop', 'roof terrace'],
        'Jardin' => ['jardin', 'garden'],
        'Cuisine équipée' => ['cuisine equipee', 'equipped kitchen', 'fitted kitchen'],
        'Gardien' => ['gardien', 'gardiennage', 'caretaker'],
        'Vue sur mer' => ['vue sur mer', 'vue sur la mer', 'vue mer', 'sea view', 'ocean view'],
        'WiFi' => ['wifi', 'wi fi', 'internet'],
        'Fibre optique' => ['fibre optique', 'fibre', 'fiber'],
        'TV' => ['tv', 'television'],
        'Machine à laver' => ['machine a laver', 'lave linge', 'washing machine'],
        'Sèche-linge' => ['seche linge', 'dryer'],
        'Micro-ondes' => ['micro ondes', 'micro onde', 'microwave'],
        'Lave-vaisselle' => ['lave vaisselle', 'dishwasher'],
        'Sécurité 24/7' => ['securite', 'securise', 'securisee', 'securite 24 / 7', 'security'],
        'Caméras de surveillance' => ['cameras de surveillance', 'camera de surveillance', 'videosurveillance', 'video surveillance', 'cctv'],
        'Portail électrique' => ['portail electrique', 'electric gate'],
        'Interphone' => ['interphone', 'intercom'],
        'Groupe électrogène' => ['groupe electrogene', 'generateur', 'generator'],
        'Panneaux solaires' => ['panneaux solaires', 'panneau solaire', 'solaire', 'solar panels', 'solar'],
        'Forage' => ['forage', 'borehole'],
        'Surpresseur' => ['surpresseur'],
        'Citerne d\'eau' => ['citerne', 'citerne d eau', 'water tank'],
        'Chauffe-eau' => ['chauffe eau', 'water heater'],
        'Ventilateurs' => ['ventilateur', 'ventilo'],
        'Moustiquaires' => ['moustiquaire'],
        'Chambre de bonne' => ['chambre de bonne'],
        'Dépendance' => ['dependance'],
        'Salle de sport' => ['salle de sport', 'gym', 'fitness'],
        'Aire de jeux' => ['aire de jeux', 'aire de jeu', 'playground'],
    ];

    /** Un type qui, à côté d'un autre type ou après « avec », est l'équipement du même nom. */
    private const TYPE_OR_AMENITY = ['parking' => 'Parking', 'garage' => 'Garage'];

    /** Faux amis d'une langue : `location` est un lieu en anglais, `sale` un adjectif en français, `local`/`vide` du français. */
    private const ONLY_IN = ['location' => 'fr', 'local' => 'fr', 'vide' => 'fr', 'sale' => 'en'];

    /**
     * Des mots du marché que le référentiel porte comme nom de lieu : « Grand Standing » est un quartier, et
     * « appartement grand standing » se lisait `location=Grand Standing` (mesuré le 2026-11-04). Jamais un lieu.
     */
    private const NOT_PLACES = ['grand standing', 'haut standing', 'tres bon standing', 'bon standing', 'moyen standing', 'standing'];

    private const MAX_OPS = [
        'moins de', 'moins d', 'max', 'maxi', 'maximum', 'jusqu a', 'jusqu au', 'jusque', '<', 'budget', 'budget max',
        'budget maximum', 'prix max', 'prix maximum', 'au plus', 'pas plus de', 'pas plus d', 'inferieur a', 'under',
        'below', 'less than', 'up to', 'at most', 'max budget',
    ];

    private const MIN_OPS = [
        'plus de', 'plus d', 'a partir de', 'a partir d', 'min', 'mini', 'minimum', 'au moins', '>', 'superieur a',
        'au dela de', 'au dela d', 'prix min', 'prix minimum', 'budget min', 'budget minimum', 'over', 'above',
        'more than', 'at least', 'from', 'starting at', 'starting from',
    ];

    /** « plus de 3 chambres » : strictement plus, donc au moins 4. */
    private const STRICT_MIN_OPS = ['plus de', 'plus d', 'superieur a', 'au dela de', 'au dela d', 'over', 'above', 'more than'];

    private const TRAILING_MAX = ['max', 'maxi', 'maximum', 'au plus', 'ou moins', 'or less'];

    private const TRAILING_MIN = ['min', 'mini', 'minimum', 'au moins', 'et plus', 'ou plus', 'or more', '+'];

    /** [ouvrant, séparateur] d'une fourchette. */
    private const RANGES = [['entre', 'et'], ['entre', 'a'], ['de', 'a'], ['de', 'au'], ['between', 'and'], ['from', 'to']];

    private const RANGE_BARE_SEPARATORS = ['-', 'a', 'au', 'to'];

    private const RANGE_INTROS = ['prix', 'budget', 'price', 'loyer'];

    private const BEDROOM_UNITS = ['ch', 'chs', 'chb', 'chbr', 'chbre', 'chbres', 'chambre', 'chambres', 'bedroom', 'bedrooms', 'bed', 'beds', 'br', 'bd', 'bdr', 'rooms'];

    private const PIECE_UNITS = ['piece', 'pieces', 'pcs', 'pc'];

    private const SALON_WORDS = ['salon', 'salons', 'sejour', 'living'];

    /** `un`/`une` n'y sont pas (« une chambre » est une chambre), `neuf` ne compte que devant une unité. */
    private const NUMBER_WORDS = [
        'deux' => 2, 'trois' => 3, 'quatre' => 4, 'cinq' => 5, 'six' => 6, 'sept' => 7, 'huit' => 8, 'neuf' => 9, 'dix' => 10,
        'one' => 1, 'two' => 2, 'three' => 3, 'four' => 4, 'five' => 5, 'seven' => 7, 'eight' => 8, 'nine' => 9, 'ten' => 10,
    ];

    /** Les multiplicateurs de `RadarAmountParser::MULTIPLIERS`. */
    private const MULTIPLIERS = ['k', 'm', 'mille', 'million', 'millions', 'milliard', 'milliards', 'md', 'mds', 'mrd', 'mrds'];

    private const CURRENCIES = ['f', 'fcfa', 'cfa', 'franc', 'francs', 'fr', 'frs', 'xof'];

    private const AREA_UNITS = ['m2' => 1, 'mc' => 1, 'sqm' => 1, 'ha' => 10_000, 'hectare' => 10_000, 'hectares' => 10_000];

    /** @var array<string, list<array{words: list<string>, key: string, value: string|bool}>>|null le vocabulaire compilé, par premier mot */
    private static ?array $vocabulary = null;

    private string $q = '';

    private string $locale = 'fr';

    /** @var list<array{text: string, f: string, from: int, to: int, phone: bool}> */
    private array $tokens = [];

    /** @var list<string> les jetons repliés */
    private array $f = [];

    /** @var array<string, list<array{words: list<string>, key: string, value: string|bool}>>|null les variantes, par premier mot */
    private ?array $aliasVocabulary = null;

    public function __construct(
        private readonly PlaceLexicon $places,
        private readonly ?VocabularyAliases $aliases = null,
    ) {}

    /**
     * TCK-2476 — le critère qu'un TERME du vocabulaire émet (« climatisation » → `tags=Climatisation`, « a louer » n'en
     * est pas un : « louer » l'est), hors types de bien (cible `property_type`) ; `null` si le terme n'en est pas un.
     * C'est la cible d'une variante `term` : elle n'est retenue que si elle existe ici.
     *
     * @return array{key: string, value: string|bool}|null
     */
    public static function termEntry(string $term): ?array
    {
        $key = CleDeQuartier::de($term);
        if ($key === null) {
            return null;
        }
        $words = explode(' ', $key);
        foreach (self::vocabulary()[$words[0]] ?? [] as $entry) {
            if ($entry['key'] !== 'type' && $entry['words'] === $words) {
                return ['key' => $entry['key'], 'value' => $entry['value']];
            }
        }

        return null;
    }

    /**
     * TCK-2476 — les termes du vocabulaire (contrat, période, ameublement, équipements), repliés : ce que l'usage
     * `search.variantes` peut viser par une variante `term`.
     *
     * @return list<string>
     */
    public static function terms(): array
    {
        $terms = [];
        foreach (self::vocabulary() as $entries) {
            foreach ($entries as $entry) {
                $term = implode(' ', $entry['words']);
                if ($entry['key'] !== 'type' && self::termEntry($term) !== null) {
                    $terms[$term] = true;
                }
            }
        }
        ksort($terms);

        return array_keys($terms);
    }

    /**
     * Revue adverse n° 3 (2026-11-04) — les écritures du vocabulaire qui émettent ce critère (« apartment » →
     * `appartement`, `appart`, `appt`…), repliées : ce dont une variante `search.variantes` doit être PROCHE.
     *
     * @return list<string>
     */
    public static function spellingsOf(string $key, string|bool $value): array
    {
        $spellings = [];
        foreach (self::vocabulary() as $entries) {
            foreach ($entries as $entry) {
                if ($entry['key'] === $key && $entry['value'] === $value) {
                    $spellings[] = implode(' ', $entry['words']);
                }
            }
        }

        return array_values(array_unique($spellings));
    }

    /**
     * Revue adverse n° 3 — un mot que l'analyse LIT déjà, ou qu'elle écarte comme mot vide : mot vide, mot de liaison,
     * négation, opérateur, unité, nombre écrit, et tout mot d'une phrase du vocabulaire, toutes langues confondues. Une
     * variante de lieu ou de type n'en est jamais faite : « proche » → Almadies détournerait toute saisie qui le porte.
     */
    public static function isCommonWord(string $word): bool
    {
        static $common = null;
        if ($common === null) {
            $words = [
                ...self::STOPWORDS, ...self::CONNECTORS, ...self::NEGATIONS, ...self::NEGATED_ARTICLES,
                ...self::BEDROOM_UNITS, ...self::PIECE_UNITS, ...self::SALON_WORDS, ...array_keys(self::NUMBER_WORDS),
                ...self::MULTIPLIERS, ...self::CURRENCIES, ...array_keys(self::AREA_UNITS), ...self::RANGE_INTROS,
            ];
            foreach ([self::MAX_OPS, self::MIN_OPS, self::TRAILING_MAX, self::TRAILING_MIN, self::NOT_PLACES] as $phrases) {
                foreach ($phrases as $phrase) {
                    array_push($words, ...explode(' ', $phrase));
                }
            }
            foreach (self::RANGES as $pair) {
                array_push($words, ...$pair);
            }
            foreach (self::vocabulary() as $entries) {
                foreach ($entries as $entry) {
                    array_push($words, ...$entry['words']);
                }
            }
            $common = array_fill_keys(array_filter($words, static fn (string $w): bool => preg_match('/^[a-z]+$/', $w) === 1), true);
        }

        return isset($common[$word]) || isset($common[self::singular($word)]);
    }

    /** @return list<string> les noms d'équipements que le parseur peut émettre */
    public static function amenityNames(): array
    {
        return [...array_keys(self::AMENITIES), ...array_values(self::TYPE_OR_AMENITY)];
    }

    public function parse(string $q, string $locale): ParsedQuery
    {
        $this->q = $q;
        $this->locale = $locale === 'en' ? 'en' : 'fr';
        $this->tokens = $this->tokenize($q);
        $this->f = array_column($this->tokens, 'f');

        $read = min(count($this->tokens), self::MAX_TOKENS);
        $matches = [];
        for ($i = 0; $i < $read;) {
            $m = $this->matchWithConnectors($i);
            if ($m === null) {
                $i++;

                continue;
            }
            $matches[] = $m;
            $i += $m['len'];
        }

        // `parking` et `garage` sont des types… sauf à côté d'un autre type, ou après « avec » : l'équipement.
        $otherType = false;
        foreach ($matches as $m) {
            foreach ($m['items'] as [$key, $value]) {
                $otherType = $otherType || ($key === 'type' && ! isset(self::TYPE_OR_AMENITY[$value]));
            }
        }
        foreach ($matches as &$m) {
            foreach ($m['items'] as &$item) {
                if ($item[0] === 'type' && isset(self::TYPE_OR_AMENITY[$item[1]]) && ($otherType || $m['with'])) {
                    $item = ['tags', self::TYPE_OR_AMENITY[$item[1]]];
                }
            }
            unset($item);
        }
        unset($m);

        return $this->assemble($matches);
    }

    // ───────────────────────────────────────────────────────── assemblage

    /** @param  list<array{start: int, len: int, items: list<array{0: string, 1: string|int|bool}>, residue: bool, with: bool, impliedCity: ?string}>  $matches */
    private function assemble(array $matches): ParsedQuery
    {
        $understood = array_fill(0, count($this->tokens), false);
        $kept = array_fill(0, count($this->tokens), false);
        $values = [];
        $types = [];
        $tags = [];
        $impliedCity = null;
        $parts = [];
        $notFurnishable = self::onlyNotFurnishable($matches);

        foreach ($matches as $m) {
            // Lue et sans critère : une négation, ou l'ameublement d'un terrain. Ni critère, ni résidu.
            if ($m['ignored'] || ($notFurnishable && $m['items'] !== [] && array_unique(array_column($m['items'], 0)) === ['furnished'])) {
                for ($k = $m['start']; $k < $m['start'] + $m['len']; $k++) {
                    $understood[$k] = true;
                }

                continue;
            }
            if ($m['residue'] || $m['items'] === []) {
                // Une phrase gardée entière à dessein : ses mots de liaison restent avec elle.
                for ($k = $m['start']; $k < $m['start'] + $m['len'] && $m['residue']; $k++) {
                    $kept[$k] = true;
                }

                continue;
            }
            foreach ($m['items'] as [$key, $value]) {
                if (! in_array($key, ['type', 'tags'], true) && array_key_exists($key, $values) && $values[$key] !== $value) {
                    continue 2;
                }
            }

            $from = $this->tokens[$m['start']]['from'];
            $to = $this->tokens[$m['start'] + $m['len'] - 1]['to'];
            for ($k = $m['start']; $k < $m['start'] + $m['len']; $k++) {
                $understood[$k] = true;
            }
            foreach ($m['items'] as [$key, $value]) {
                match ($key) {
                    'type' => $types[$value] = true,
                    'tags' => $tags[$value] = true,
                    default => $values[$key] = $value,
                };
                $parts[] = ['key' => $key, 'value' => $value, 'from' => $from, 'to' => $to];
            }
            if ($m['impliedCity'] !== null) {
                $impliedCity = $m['impliedCity'];
            }
        }

        if ($types !== []) {
            $values['type'] = implode(',', array_keys($types));
        }
        if ($tags !== []) {
            $values['tags'] = implode(',', array_keys($tags));
        }
        if (! isset($values['city']) && isset($values['location']) && $impliedCity !== null) {
            $values['city'] = $impliedCity;
        }

        $criteria = [];
        foreach (self::CRITERIA as $key) {
            if (array_key_exists($key, $values)) {
                $criteria[$key] = $values[$key];
            }
        }

        return new ParsedQuery($criteria, $parts, $this->residue($understood, $kept), $criteria !== []);
    }

    /**
     * Vrai si la saisie ne comprend que des types qui ne se meublent pas ({@see self::NOT_FURNISHABLE}).
     *
     * @param  list<array{items: list<array{0: string, 1: string|int|bool}>, residue: bool}>  $matches
     */
    private static function onlyNotFurnishable(array $matches): bool
    {
        $types = [];
        foreach ($matches as $m) {
            foreach ($m['residue'] ? [] : $m['items'] as [$key, $value]) {
                if ($key === 'type') {
                    $types[] = $value;
                }
            }
        }

        return $types !== [] && array_diff($types, self::NOT_FURNISHABLE) === [];
    }

    /**
     * Les mots non compris, dans l'écriture de la saisie : chaque suite de jetons non compris est recopiée telle
     * qu'écrite (« jusqu'à » garde son apostrophe), les suites jointes par une espace. Un symbole seul n'est pas un mot.
     * Un mot vide ({@see self::STOPWORDS}) hors d'une phrase gardée (`$kept`) coupe la suite, comme un mot compris.
     *
     * @param  list<bool>  $understood
     * @param  list<bool>  $kept
     */
    private function residue(array $understood, array $kept): ?string
    {
        $runs = [];
        $run = null;
        foreach ($this->tokens as $k => $token) {
            if ($understood[$k] || (! $kept[$k] && in_array($token['f'], self::STOPWORDS, true))) {
                $run = null;

                continue;
            }
            $word = preg_match('/[\p{L}\p{N}]/u', $token['text']) === 1;
            if ($run === null) {
                if (! $word) {
                    continue;
                }
                $runs[] = [$token['from'], $token['to']];
                $run = count($runs) - 1;
            } elseif ($word) {
                $runs[$run][1] = $token['to'];
            }
        }

        $text = implode(' ', array_map(fn (array $r): string => mb_substr($this->q, $r[0], $r[1] - $r[0]), $runs));
        $text = trim((string) preg_replace('/\s+/u', ' ', $text));

        return $text === '' ? null : $text;
    }

    // ───────────────────────────────────────────────────────── lecture

    /**
     * Les jetons de la saisie, positions en caractères. `phone` : le jeton fait partie d'un numéro de téléphone que le
     * masquage voit ({@see PhoneMasker::MASK_PATTERN}, comme `RadarAmountParser`) — « 77 123 45 67 » n'est pas un prix
     * de 77 123 : il ne se lit jamais comme une quantité et reste au résidu.
     *
     * @return list<array{text: string, f: string, from: int, to: int, phone: bool}>
     */
    private function tokenize(string $q): array
    {
        // Un mot, un nombre (décimale ou groupement collés : « 1,5 », « 450.000f »), un opérateur, un tiret qui n'est pas
        // dans un mot (« 300k-600k », « 300k - 600k », mais pas « Sacré-Cœur » ni « non-meublé »).
        $pattern = '/[\p{L}\p{N}²³]+(?:[.,]\p{N}+[\p{L}\p{N}²³]*)*|[<>≤≥\/+]|(?<!\p{L})[-–—]|[-–—](?!\p{L})/u';
        if (preg_match_all($pattern, $q, $found, PREG_OFFSET_CAPTURE) < 1) {
            return [];
        }

        // Le `+` d'un étage (`R+1`) n'est pas un indicatif ; un octet pour un, les positions restent justes.
        $phones = [];
        if (preg_match_all(PhoneMasker::MASK_PATTERN, RadarPhone::withoutFloorPlus($q), $numbers, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($numbers[0] as [$number, $byte]) {
                $phones[] = [$byte, $byte + strlen($number)];
            }
        }

        $tokens = [];
        foreach ($found[0] as [$text, $byte]) {
            $from = mb_strlen(substr($q, 0, $byte));
            $folded = strtr($text, ['≤' => '<', '≥' => '>', '–' => '-', '—' => '-', '²' => '2', '³' => '3']);
            $folded = Str::ascii(CaseInsensitive::fold(PhoneMasker::normalizeDigits($folded)));
            $phone = false;
            foreach ($phones as [$start, $end]) {
                $phone = $phone || ($byte < $end && $byte + strlen($text) > $start);
            }
            $tokens[] = ['text' => $text, 'f' => $folded, 'from' => $from, 'to' => $from + mb_strlen($text), 'phone' => $phone];
        }

        return $tokens;
    }

    /** @return array{start: int, len: int, items: list<array{0: string, 1: string|int|bool}>, residue: bool, with: bool, impliedCity: ?string}|null */
    private function matchWithConnectors(int $i): ?array
    {
        $m = $this->matchAt($i);
        if ($m !== null) {
            return $m;
        }

        $with = false;
        for ($j = $i + 1; $j <= $i + 2 && in_array($this->f[$j - 1] ?? null, self::CONNECTORS, true); $j++) {
            $with = $with || in_array($this->f[$j - 1], self::WITH, true);
            $m = $this->matchAt($j);
            if ($m !== null && ! $m['residue']) {
                return ['start' => $i, 'len' => $m['len'] + ($j - $i), 'with' => $m['with'] || $with] + $m;
            }
            if ($m !== null) {
                return null;
            }
        }

        return null;
    }

    /** @return array{start: int, len: int, items: list<array{0: string, 1: string|int|bool}>, residue: bool, with: bool, impliedCity: ?string}|null */
    private function matchAt(int $i): ?array
    {
        if (! isset($this->f[$i])) {
            return null;
        }

        $best = null;
        foreach ([
            $this->notPlace($i),
            $this->negation($i),
            $this->range($i),
            $this->operator($i),
            $this->bedrooms($i),
            $this->bareQuantity($i),
            $this->phrase($i),
            $this->place($i),
        ] as $candidate) {
            if ($candidate !== null && ($best === null || $candidate['len'] > $best['len'])) {
                $best = $candidate;
            }
        }

        return $best ?? $this->fuzzy($i);
    }

    /**
     * @param  list<array{0: string, 1: string|int|bool}>  $items
     * @return array{start: int, len: int, items: list<array{0: string, 1: string|int|bool}>, residue: bool, with: bool, impliedCity: ?string}
     */
    private static function found(int $start, int $end, array $items, bool $residue = false, ?string $impliedCity = null, bool $ignored = false): array
    {
        return ['start' => $start, 'len' => $end - $start + 1, 'items' => $items, 'residue' => $residue, 'with' => false, 'impliedCity' => $impliedCity, 'ignored' => $ignored];
    }

    // ───────────────────────────────────────────────────────── les lecteurs

    private function notPlace(int $i): ?array
    {
        foreach (self::NOT_PLACES as $phrase) {
            $len = $this->phraseAt($i, $phrase);
            if ($len !== null) {
                return self::found($i, $i + $len - 1, [], residue: true);
            }
        }

        return null;
    }

    /** « sans piscine », « pas de clim », « without pool » : lue, et rien n'en sort ({@see self::NEGATIONS}). */
    private function negation(int $i): ?array
    {
        if (! in_array($this->f[$i], self::NEGATIONS, true)) {
            return null;
        }
        $k = $i + 1;
        if (in_array($this->f[$k] ?? null, self::NEGATED_ARTICLES, true)) {
            $k++;
        }
        $m = isset($this->f[$k]) ? ($this->phrase($k) ?? $this->fuzzy($k)) : null;
        if ($m === null || $m['items'] === []) {
            return null;
        }
        foreach ($m['items'] as [$key, $value]) {
            if ($key !== 'tags' && ! ($key === 'type' && isset(self::TYPE_OR_AMENITY[$value]))) {
                return null;
            }
        }

        return self::found($i, $m['start'] + $m['len'] - 1, [], ignored: true);
    }

    /** « entre 300k et 600k », « de 50 à 80 millions », « 300k-600k », « entre 200 et 400 m2 », « 2 à 3 chambres ». */
    private function range(int $i): ?array
    {
        $k = in_array($this->f[$i], self::RANGE_INTROS, true) ? $i + 1 : $i;

        foreach (self::RANGES as [$open, $separator]) {
            if (($this->f[$k] ?? null) !== $open) {
                continue;
            }
            $low = $this->quantity($k + 1);
            if ($low !== null && ($this->f[$low['end'] + 1] ?? null) === $separator) {
                $range = $this->rangeOf($i, $low, $this->quantity($low['end'] + 2), bare: false);
                if ($range !== null) {
                    return $range;
                }
            }
        }

        $low = $this->quantity($k);
        if ($low !== null && in_array($this->f[$low['end'] + 1] ?? null, self::RANGE_BARE_SEPARATORS, true)) {
            return $this->rangeOf($i, $low, $this->quantity($low['end'] + 2), bare: true);
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $low
     * @param  array<string, mixed>|null  $high
     */
    private function rangeOf(int $start, array $low, ?array $high, bool $bare): ?array
    {
        if ($high === null) {
            return null;
        }

        if ($high['kind'] === 'area') {
            // « entre 1 et 2 hectares », « 1,5 à 3 ha » : la borne basse sans unité prend celle de la haute (`mult` porte
            // le facteur d'une surface) — sans quoi « 1 » se lisait 1 m² face à 20 000 m².
            $a = $low['kind'] === 'area' ? $low['value'] : self::area($low['number'], (int) ($high['mult'] ?? 1));
            if ($a === null) {
                return null;
            }
            [$min, $max] = [min($a, $high['value']), max($a, $high['value'])];

            return self::found($start, $high['end'], [['area_min', $min], ['area_max', $max]]);
        }

        if ($high['kind'] === 'count') {
            $a = in_array($low['kind'], ['count', 'number'], true) ? self::integer($low['number']) : null;
            if ($a === null || $a > 20) {
                return null;
            }

            return $this->countFound($start, $high['end'], min($a, (int) $high['number']), $high['pieces']);
        }

        if ($high['kind'] !== 'price' || (! $high['marked'] && $high['value'] < self::BARE_PLAIN_MIN)) {
            return null;
        }
        if ($bare && ! $low['marked'] && ! $high['marked']) {
            return null;
        }

        // « entre 300 et 600k », « entre 1 et 2 millions » : la borne basse prend le multiplicateur de la haute.
        $a = match (true) {
            $low['kind'] === 'price' && $low['marked'] => $low['value'],
            in_array($low['kind'], ['price', 'number'], true) && $high['mult'] !== null => RadarAmountParser::parse($low['raw'].' '.$high['mult'])['amount'] ?? null,
            $low['kind'] === 'price' => $low['value'],
            default => null,
        };
        if ($a === null) {
            return null;
        }

        return self::found($start, $high['end'], [['price_min', min($a, $high['value'])], ['price_max', max($a, $high['value'])]]);
    }

    /** « moins de 500k », « à partir de 250 000 », « plus de 200 m2 », « au moins 3 chambres ». */
    private function operator(int $i): ?array
    {
        $op = null;
        foreach (['max' => self::MAX_OPS, 'min' => self::MIN_OPS] as $direction => $phrases) {
            foreach ($phrases as $phrase) {
                $len = $this->phraseAt($i, $phrase);
                if ($len !== null && ($op === null || $len > $op['len'])) {
                    $op = ['direction' => $direction, 'len' => $len, 'phrase' => $phrase];
                }
            }
        }
        if ($op === null) {
            return null;
        }

        $q = $this->quantity($i + $op['len']);
        if ($q === null) {
            return null;
        }

        return match ($q['kind']) {
            'price' => self::found($i, $q['end'], [['price_'.$op['direction'], $q['value']]]),
            'area' => self::found($i, $q['end'], [['area_'.$op['direction'], $q['value']]]),
            // Le paramètre `bedrooms` est un minimum : « moins de 3 chambres » n'a pas de traduction, il reste entier.
            'count' => $op['direction'] === 'max'
                ? self::found($i, $q['end'], [], residue: true)
                : $this->countFound($i, $q['end'], (int) $q['number'] + (in_array($op['phrase'], self::STRICT_MIN_OPS, true) ? 1 : 0), $q['pieces']),
            default => null,
        };
    }

    /** « 3 chambres », « 3ch », « F3 », « T2 », « chambre salon », « 4 pièces », « 2 bedroom ». */
    private function bedrooms(int $i): ?array
    {
        $f = $this->f;
        $k = $f[$i] === 'type' ? $i + 1 : $i;

        if (preg_match('/^[ft](\d{1,2})$/', $f[$k] ?? '', $mm) === 1) {
            return $this->countFound($i, $k, (int) $mm[1], pieces: true);
        }
        if (in_array($f[$k] ?? null, ['f', 't'], true) && preg_match('/^\d{1,2}$/', $f[$k + 1] ?? '') === 1) {
            return $this->countFound($i, $k + 1, (int) $f[$k + 1], pieces: true);
        }

        if (self::same($f[$i], 'chambre')) {
            $s = in_array($f[$i + 1] ?? null, ['+', 'et', '-', 'and'], true) ? $i + 2 : $i + 1;
            if (in_array($f[$s] ?? null, self::SALON_WORDS, true)) {
                return $this->countFound($i, $s, 1, pieces: false);
            }
        }

        $q = $this->quantity($i);

        return $q !== null && $q['kind'] === 'count' ? $this->countFound($i, $q['end'], (int) $q['number'], $q['pieces']) : null;
    }

    /**
     * Un nombre de chambres (ou de pièces, une de plus) lu de `$start` à `$end`, suivi peut-être de « minimum » / « et
     * plus » (absorbés) ou de « max » / « au plus » : un maximum n'a pas de paramètre, tout reste au résidu.
     */
    private function countFound(int $start, int $end, int $n, bool $pieces): ?array
    {
        $bedrooms = $pieces ? max(0, $n - 1) : $n;
        if ($bedrooms > self::MAX_BEDROOMS) {
            return self::found($start, $end, [], residue: true);
        }

        foreach (self::TRAILING_MAX as $phrase) {
            $len = $this->phraseAt($end + 1, $phrase);
            if ($len !== null && $this->quantity($end + 1 + $len) === null) {
                return self::found($start, $end + $len, [], residue: true);
            }
        }
        foreach (self::TRAILING_MIN as $phrase) {
            $len = $this->phraseAt($end + 1, $phrase);
            if ($len !== null) {
                $end += $len;
                break;
            }
        }

        return self::found($start, $end, [['bedrooms', $bedrooms]]);
    }

    /** Un montant ou une surface sans opérateur devant : « 500k » → `price_max`, « 300 m2 » → `area_min`. */
    private function bareQuantity(int $i): ?array
    {
        $q = $this->quantity($i);
        if ($q !== null && $q['kind'] === 'noise') {
            // Lus ensemble, ces chiffres ne sont rien : aucun de leurs morceaux ne se relit en prix.
            return self::found($i, $q['end'], [], residue: true);
        }
        if ($q === null || ! in_array($q['kind'], ['price', 'area'], true)) {
            return null;
        }

        $end = $q['end'];
        $direction = null;
        foreach (['max' => self::TRAILING_MAX, 'min' => self::TRAILING_MIN] as $d => $phrases) {
            foreach ($phrases as $phrase) {
                $len = $this->phraseAt($end + 1, $phrase);
                if ($len !== null && $direction === null) {
                    $direction = $d;
                    $end += $len;
                }
            }
        }

        if ($q['kind'] === 'area') {
            return self::found($i, $end, [['area_'.($direction ?? 'min'), $q['value']]]);
        }
        if ($direction === null && ! $q['marked'] && $q['value'] < self::BARE_PLAIN_MIN) {
            return null;
        }

        return self::found($i, $end, [['price_'.($direction ?? 'max'), $q['value']]]);
    }

    /** Type, contrat, période, ameublement, équipement : la plus longue phrase du vocabulaire ou de ses variantes. */
    private function phrase(int $i): ?array
    {
        $vocabulary = self::vocabulary();
        $aliases = $this->aliasVocabulary();
        $best = null;
        foreach (array_unique([$this->f[$i], self::singular($this->f[$i])]) as $first) {
            foreach ([...($vocabulary[$first] ?? []), ...($aliases[$first] ?? [])] as $entry) {
                $len = $this->wordsAt($i, $entry['words']);
                if ($len === null || ($best !== null && $len <= $best['len']) || ! $this->allowed($entry, $i)) {
                    continue;
                }
                $best = self::found($i, $i + $len - 1, [[$entry['key'], $entry['value']]]);
            }
        }

        return $best;
    }

    /** Une ville ou un quartier du lexique. */
    private function place(int $i): ?array
    {
        if (preg_match('/^[a-z]/', $this->f[$i]) !== 1) {
            return null;
        }

        $words = array_slice($this->f, $i, 8);
        $match = $this->places->longestMatch($words);
        // « Sacré-Cœur 3 chambres » : le lieu « Sacré-Cœur 3 » existe, mais le 3 compte des chambres.
        if ($match !== null && $match['length'] > 1 && ctype_digit($this->f[$i + $match['length'] - 1])
            && $this->isUnit($this->f[$i + $match['length']] ?? '')) {
            $match = $this->places->longestMatch(array_slice($words, 0, $match['length'] - 1));
        }
        if ($match === null || $match['length'] < 1) {
            return null;
        }

        $end = $i + $match['length'] - 1;

        return $match['kind'] === 'city'
            ? self::found($i, $end, [['city', $match['name']]])
            : self::found($i, $end, [['location', $match['name']]], impliedCity: $match['city']);
    }

    /**
     * La faute de frappe d'un mot-clé d'un seul mot. Une lettre de différence (deux pour un mot-clé de neuf lettres ou
     * plus, tapé sur huit au moins) sur un mot-clé d'au moins six lettres qui commence par la même ; ou le début d'un
     * mot-clé, d'au moins six lettres. Retenue seulement si elle ne désigne qu'une seule chose.
     */
    private function fuzzy(int $i): ?array
    {
        $token = self::singular($this->f[$i]);
        if (preg_match('/^[a-z]{5,}$/', $token) !== 1 || in_array($token, self::CONNECTORS, true)) {
            return null;
        }

        $targets = [];
        foreach (self::vocabulary() as $entries) {
            foreach ($entries as $entry) {
                if (count($entry['words']) !== 1 || ! $this->allowed($entry, $i)) {
                    continue;
                }
                $word = $entry['words'][0];
                $close = strlen($word) >= 6 && $word[0] === $token[0] && abs(strlen($word) - strlen($token)) <= 2
                    && self::distance($token, $word) <= (strlen($word) >= 9 && strlen($token) >= 8 ? 2 : 1);
                $start = strlen($token) >= 6 && strlen($word) > strlen($token) && str_starts_with($word, $token);
                if ($close || $start) {
                    $targets[$entry['key'].'='.var_export($entry['value'], true)] = $entry;
                }
            }
        }

        if (count($targets) !== 1) {
            return null;
        }
        $entry = array_values($targets)[0];

        return self::found($i, $i, [[$entry['key'], $entry['value']]]);
    }

    // ───────────────────────────────────────────────────────── les quantités

    /**
     * Ce qui commence en `$j` : un compte (« 3 chambres », « deux ch »), une surface (« 300m2 », « 1 hectare »), un
     * montant lu par {@see RadarAmountParser}, un nombre seul (`number` : ni montant, ni unité), ou des chiffres
     * juxtaposés au-delà de {@see self::MAX_PRICE} (`noise`).
     *
     * @return array{kind: 'count'|'area'|'price'|'number'|'noise', value: int, number: string, end: int, raw: string, mult: ?string, marked: bool, pieces: bool}|null
     */
    private function quantity(int $j): ?array
    {
        $f = $this->f;
        $t = $f[$j] ?? null;
        if ($t === null) {
            return null;
        }

        if (isset(self::NUMBER_WORDS[$t])) {
            $unit = $this->countUnit($j + 1);

            return $unit === null ? null : self::quantityOf('count', self::NUMBER_WORDS[$t], (string) self::NUMBER_WORDS[$t], $unit['end'], $t, pieces: $unit['pieces']);
        }
        // « R+1 500 000 F » : l'étage n'est pas le début du prix (TCK-2445 côté Radar).
        if (preg_match('/^\d/', $t) !== 1 || $this->tokens[$j]['phone'] || ($f[$j - 1] ?? null) === '+') {
            return null;
        }

        // « 3ch », « 4pieces », « 3+chambres »
        if (preg_match('/^(\d{1,2})\+?('.implode('|', [...self::BEDROOM_UNITS, ...self::PIECE_UNITS]).')$/', $t, $mm) === 1) {
            $end = in_array($mm[2], self::BEDROOM_UNITS, true) ? $this->afterSalon($j) : $j;

            return (int) $mm[1] > self::MAX_BEDROOMS
                ? self::quantityOf('noise', 0, $mm[1], $end, $t)
                : self::quantityOf('count', (int) $mm[1], $mm[1], $end, $t, pieces: in_array($mm[2], self::PIECE_UNITS, true));
        }
        // « 300m2 », « 1,5ha »
        if (preg_match('/^(\d+(?:[.,]\d+)?)(m2|mc|sqm|ha|hectares?)$/', $t, $mm) === 1) {
            $area = self::area($mm[1], self::AREA_UNITS[$mm[2]]);

            return $area === null ? null : self::quantityOf('area', $area, $mm[1], $j, $t, (string) self::AREA_UNITS[$mm[2]]);
        }

        // « 100 000 », « 25 000 000 F » : les groupes de trois chiffres séparés par une espace.
        $k = $j;
        if (preg_match('/^\d{1,3}$/', $t) === 1) {
            while (isset($f[$k + 1]) && ctype_digit($f[$k]) && ! $this->tokens[$k + 1]['phone'] && preg_match('/^\d{3}[a-z]*$/', $f[$k + 1]) === 1
                && trim(mb_substr($this->q, $this->tokens[$k]['to'], $this->tokens[$k + 1]['from'] - $this->tokens[$k]['to'])) === '') {
                $k++;
            }
        }

        $senegaleseMillion = preg_match('/^\d+m\d{1,3}$/', $f[$k]) === 1 && preg_match('/^\d+m[23]$/', $f[$k]) !== 1;
        if (! $senegaleseMillion && preg_match('/^([\d.,]*\d)([a-z]*)$/', $f[$k], $sm) !== 1) {
            return null;
        }
        $suffix = $senegaleseMillion ? '' : $sm[2];
        $fraction = 0;
        $fractionEnd = null;
        $digits = implode('', array_map(static fn (string $p): string => (string) preg_replace('/[a-z]+$/', '', $p), array_slice($f, $j, $k - $j + 1)));
        $end = $k;
        $mult = null;
        $marked = $senegaleseMillion || $k > $j || preg_match('/\d[.,]\d{3}(?!\d)/', $f[$k]) === 1;

        if ($senegaleseMillion) {
            $mult = 'm';
        } elseif ($suffix === '') {
            $unit = $this->countUnit($k + 1);
            // « 25 chambres » est un compte (revue adverse n° 11 : au-delà de 20, « chambres » retombait sur le type) ;
            // au-delà de ce que la liste accepte, la phrase entière reste au résidu.
            if ($unit !== null && $k === $j && ctype_digit($t)) {
                return (int) $t <= self::MAX_BEDROOMS
                    ? self::quantityOf('count', (int) $t, $t, $unit['end'], $t, pieces: $unit['pieces'])
                    : self::quantityOf('noise', 0, $t, $unit['end'], $t);
            }
            $area = $this->areaUnit($k + 1);
            if ($area !== null) {
                $value = self::area($digits, $area['factor']);

                return $value === null ? null : self::quantityOf('area', $value, $digits, $area['end'], $digits, (string) $area['factor']);
            }
            if (in_array($f[$k + 1] ?? null, self::MULTIPLIERS, true)) {
                $mult = $f[$k + 1];
                $end = $k + 1;
                $marked = true;
                [$fraction, $fractionEnd] = $this->millionFraction($end);
            }
        } elseif (in_array($suffix, self::MULTIPLIERS, true)) {
            $mult = $suffix;
            $marked = true;
            [$fraction, $fractionEnd] = $this->millionFraction($k);
        } elseif (in_array($suffix, self::CURRENCIES, true)) {
            $marked = true;
        } elseif (isset(self::AREA_UNITS[$suffix])) {
            $value = self::area($digits, self::AREA_UNITS[$suffix]);

            return $value === null ? null : self::quantityOf('area', $value, $digits, $k, $digits, (string) self::AREA_UNITS[$suffix]);
        } else {
            return null;
        }

        $amountEnd = $end;
        $end = $fractionEnd ?? $end;
        if ($suffix === '' || $mult !== null) {
            if (in_array($f[$end + 1] ?? null, self::CURRENCIES, true)) {
                $end++;
                $marked = true;
                if ($f[$end] === 'f' && ($f[$end + 1] ?? null) === 'cfa') {
                    $end++;
                }
            }
        }

        $raw = mb_substr($this->q, $this->tokens[$j]['from'], $this->tokens[$fractionEnd === null ? $end : $amountEnd]['to'] - $this->tokens[$j]['from']);
        $amount = RadarAmountParser::parse($raw)['amount'] ?? null;
        $amount = $amount === null ? null : $amount + $fraction;
        if ($amount !== null && $amount > self::MAX_PRICE) {
            return self::quantityOf('noise', 0, $digits, $end, $raw);
        }
        if ($amount === null) {
            return $marked || ! ctype_digit($digits) ? null : self::quantityOf('number', (int) $digits, $digits, $end, $raw);
        }

        return self::quantityOf('price', $amount, $digits, $end, $raw, $mult, $marked);
    }

    /** @return array{kind: 'count'|'area'|'price'|'number'|'noise', value: int, number: string, end: int, raw: string, mult: ?string, marked: bool, pieces: bool} */
    private static function quantityOf(string $kind, int $value, string $number, int $end, string $raw, ?string $mult = null, bool $marked = false, bool $pieces = false): array
    {
        return compact('kind', 'value', 'number', 'end', 'raw', 'mult', 'marked', 'pieces');
    }

    /**
     * Revue adverse n° 11 — « 2 millions 500 » : après « million(s) » en `$at`, un nombre de deux ou trois chiffres que
     * rien ne suit (ni unité de compte ou de surface, ni autre multiplicateur que « mille », ni groupe de trois chiffres)
     * est la part des milliers — 2 500 000, comme on le dit. Un seul chiffre ne l'est pas : « 2 millions 5 » se lit
     * aussi 2,5 M, et « 2 millions 3 chambres » compte des chambres.
     *
     * @return array{0: int, 1: ?int} la part (en XOF) et le dernier jeton lu, ou `[0, null]`
     */
    private function millionFraction(int $at): array
    {
        $f = $this->f;
        $t = $f[$at + 1] ?? null;
        if (! in_array($f[$at], ['million', 'millions'], true) || $t === null || preg_match('/^\d{2,3}$/', $t) !== 1 || $this->tokens[$at + 1]['phone']) {
            return [0, null];
        }
        $next = $f[$at + 2] ?? null;
        if ($this->countUnit($at + 2) !== null || $this->areaUnit($at + 2) !== null || ($next !== null && preg_match('/^\d{3}$/', $next) === 1)
            || ($next !== 'mille' && in_array($next, self::MULTIPLIERS, true))) {
            return [0, null];
        }

        return [(int) $t * 1000, $next === 'mille' ? $at + 2 : $at + 1];
    }

    /** @return array{end: int, pieces: bool}|null « chambres », « + chambres », « ch salon », « pièces » en `$j` */
    private function countUnit(int $j): ?array
    {
        $j = ($this->f[$j] ?? null) === '+' ? $j + 1 : $j;
        $unit = $this->f[$j] ?? null;
        if (in_array($unit, self::PIECE_UNITS, true)) {
            return ['end' => $j, 'pieces' => true];
        }

        return in_array($unit, self::BEDROOM_UNITS, true) ? ['end' => $this->afterSalon($j), 'pieces' => false] : null;
    }

    /** Le salon d'un « 3 chambres salon », « 3 ch + salon », absorbé : il ne change pas le compte. */
    private function afterSalon(int $unit): int
    {
        $s = in_array($this->f[$unit + 1] ?? null, ['+', 'et', '-', 'and'], true) ? $unit + 2 : $unit + 1;

        return in_array($this->f[$s] ?? null, self::SALON_WORDS, true) ? $s : $unit;
    }

    /** @return array{end: int, factor: int}|null « m2 », « m² », « mètres carrés », « hectares » en `$j` */
    private function areaUnit(int $j): ?array
    {
        $u = $this->f[$j] ?? null;
        if ($u !== null && isset(self::AREA_UNITS[$u])) {
            return ['end' => $j, 'factor' => self::AREA_UNITS[$u]];
        }
        if (in_array($u, ['m', 'metre', 'metres', 'meter', 'meters'], true) && in_array($this->f[$j + 1] ?? null, ['2', 'carre', 'carres'], true)) {
            return ['end' => $j + 1, 'factor' => 1];
        }

        return null;
    }

    private function isUnit(string $word): bool
    {
        return in_array($word, [...self::BEDROOM_UNITS, ...self::PIECE_UNITS, 'm', 'metres', 'metre'], true) || isset(self::AREA_UNITS[$word]);
    }

    /** « 300 » × 1, « 1,5 » × 10 000 (hectares), « 1 000 » : un entier de m², ou null. */
    private static function area(string $number, int $factor): ?int
    {
        $number = preg_match('/^\d{1,3}(?:[.,]\d{3})+$/', $number) === 1 ? (string) preg_replace('/[.,]/', '', $number) : str_replace(',', '.', $number);
        if (! is_numeric($number) || strlen($number) > 9) {
            return null;
        }
        $value = (int) round((float) $number * $factor);

        return $value > 0 ? $value : null;
    }

    private static function integer(string $number): ?int
    {
        return ctype_digit($number) && strlen($number) <= 9 ? (int) $number : null;
    }

    // ───────────────────────────────────────────────────────── le vocabulaire

    /** @return array<string, list<array{words: list<string>, key: string, value: string|bool}>> */
    private static function vocabulary(): array
    {
        if (self::$vocabulary !== null) {
            return self::$vocabulary;
        }

        $entries = [];
        $add = static function (string $key, string|bool $value, array $phrases) use (&$entries): void {
            foreach ($phrases as $phrase) {
                $entries[] = ['words' => explode(' ', $phrase), 'key' => $key, 'value' => $value];
            }
        };
        foreach (self::TYPES as $type => $phrases) {
            $add('type', $type, $phrases);
        }
        foreach (self::CONTRACTS as $contract => $phrases) {
            $add('contract_type', $contract, $phrases);
        }
        foreach (self::PERIODS as $period => $phrases) {
            $add('rent_period', $period, $phrases);
        }
        foreach (self::FURNISHED as $furnished => $phrases) {
            $add('furnished', $furnished === 'true', $phrases);
        }
        foreach (self::AMENITIES as $name => $phrases) {
            $add('tags', $name, $phrases);
        }

        $index = [];
        foreach ($entries as $entry) {
            $index[$entry['words'][0]][] = $entry;
        }

        return self::$vocabulary = $index;
    }

    /**
     * TCK-2476 — les variantes de {@see VocabularyAliases}, compilées comme le vocabulaire (par premier mot) ; lues une
     * fois par instance. Jamais lues par {@see self::fuzzy()} : une faute de frappe se corrige vers un mot-clé, pas vers
     * une variante.
     *
     * @return array<string, list<array{words: list<string>, key: string, value: string|bool}>>
     */
    private function aliasVocabulary(): array
    {
        if ($this->aliasVocabulary !== null) {
            return $this->aliasVocabulary;
        }

        $index = [];
        foreach ($this->aliases?->entries() ?? [] as $alias) {
            $key = CleDeQuartier::de($alias['alias']);
            if ($key !== null) {
                $words = explode(' ', $key);
                $index[$words[0]][] = ['words' => $words, 'key' => $alias['key'], 'value' => $alias['value']];
            }
        }

        return $this->aliasVocabulary = $index;
    }

    /** @param  array{words: list<string>, key: string, value: string|bool}  $entry */
    private function allowed(array $entry, int $i): bool
    {
        $only = count($entry['words']) === 1 ? (self::ONLY_IN[$entry['words'][0]] ?? null) : null;
        if ($only !== null && $only !== $this->locale) {
            return false;
        }

        // « garage fermé » : le participe n'est pas une ferme.
        return ! ($entry['words'] === ['ferme'] && str_contains(mb_strtolower($this->tokens[$i]['text']), 'fermé'));
    }

    /** Le nombre de jetons qu'occupe `$phrase` à partir de `$i`, ou null. */
    private function phraseAt(int $i, string $phrase): ?int
    {
        return $this->wordsAt($i, explode(' ', $phrase));
    }

    /** @param  list<string>  $words */
    private function wordsAt(int $i, array $words): ?int
    {
        foreach ($words as $k => $word) {
            if (! isset($this->f[$i + $k]) || ! self::same($this->f[$i + $k], $word)) {
                return null;
            }
        }

        return count($words);
    }

    /** Le jeton est le mot, ou son pluriel en -s / -x (« villas », « bureaux »). */
    private static function same(string $token, string $word): bool
    {
        return $token === $word || self::singular($token) === $word;
    }

    private static function singular(string $token): string
    {
        return strlen($token) > 3 && preg_match('/^[a-z]+[sx]$/', $token) === 1 ? substr($token, 0, -1) : $token;
    }

    /** Distance de Damerau (optimal string alignment) : « apaprtement » est à une transposition d'« appartement ». */
    private static function distance(string $a, string $b): int
    {
        $la = strlen($a);
        $lb = strlen($b);
        $d = [];
        for ($x = 0; $x <= $la; $x++) {
            $d[$x][0] = $x;
        }
        for ($y = 0; $y <= $lb; $y++) {
            $d[0][$y] = $y;
        }
        for ($x = 1; $x <= $la; $x++) {
            for ($y = 1; $y <= $lb; $y++) {
                $cost = $a[$x - 1] === $b[$y - 1] ? 0 : 1;
                $d[$x][$y] = min($d[$x - 1][$y] + 1, $d[$x][$y - 1] + 1, $d[$x - 1][$y - 1] + $cost);
                if ($x > 1 && $y > 1 && $a[$x - 1] === $b[$y - 2] && $a[$x - 2] === $b[$y - 1]) {
                    $d[$x][$y] = min($d[$x][$y], $d[$x - 2][$y - 2] + 1);
                }
            }
        }

        return $d[$la][$lb];
    }
}
