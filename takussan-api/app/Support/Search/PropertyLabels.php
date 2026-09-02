<?php

namespace App\Support\Search;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\TitleType;
use App\Models\Property;
use Illuminate\Support\Carbon;

/**
 * TCK-506 — les trois champs DÉRIVÉS du document Meilisearch d'un bien :
 * `rooms_label`, `facts_label`, `derived_title`.
 *
 * Classe PURE au sens « aucun accès base, aucune relation chargée ici » —
 * l'adresse est PASSÉE par l'appelant (`Property::toSearchableArray()` l'a
 * déjà en main). Elle lit le conteneur pour UNE chose : `trans()`, le libellé
 * de type de `lang/fr/properties.php` ; c'est pourquoi son test étend
 * `Tests\TestCase` et non `PHPUnit\Framework\TestCase`.
 * Tout est recalculé à chaque indexation depuis les colonnes ; rien n'est
 * stocké, rien ne sort de l'API (contrainte 2 du ticket).
 *
 * ── LA CONVENTION ─────────────────────────────────────────────────────────
 *
 * **F(n) = chambres + 1, le salon compté** (décision produit du 2026-09-02) :
 * un studio est F1, « chambre salon » est F2, « 3 chambres salon » est F4.
 * T(n) est synonyme de F(n). ⚠ Le jeu de démonstration écrivait l'inverse
 * (`F{bedrooms}`) jusqu'à ce ticket ; `SenegalFakerProvider` est aligné.
 *
 * ── POURQUOI CHAQUE VARIANTE EST ÉMISE, ET PAS UN SYNONYME MOTEUR ─────────
 *
 * Mesuré le 2026-09-02 sur l'index local : `oneTypo` est à 5 caractères, donc
 * « F4 », « T4 », « rdc », « sdb », « TF » n'ont droit à AUCUNE approximation ;
 * et un synonyme Meilisearch ne sert que si le texte porte déjà l'une des
 * formes. Un document qui porte lui-même chaque variante n'a besoin ni de
 * l'un ni de l'autre. Sans diacritiques : le moteur les replie à l'indexation
 * comme à la requête (mesuré TCK-339), écrire « pièce » ou « piece » revient
 * au même — la forme nue est celle qu'on lit dans un test.
 *
 * ── GARDÉ PAR LE TYPE ─────────────────────────────────────────────────────
 *
 * Le seed posait des chambres sur des terrains et des entrepôts (moyenne 3,2
 * sur `land`) : sans la garde, `q=F4` aurait rendu des parcelles. La table
 * {@see FAMILLES} est FERMÉE et couvre exactement `PropertyType` ; un test
 * l'épingle, comme pour les tables d'alias (TCK-339).
 */
final class PropertyLabels
{
    public const FAMILLE_HABITATION = 'habitation';

    public const FAMILLE_FONCIER = 'foncier';

    public const FAMILLE_PROFESSIONNEL = 'professionnel';

    /**
     * Famille de chaque type — gouverne la grammaire du titre dérivé et les
     * faits qu'un type a le droit d'émettre.
     *
     * @var array<string,string>
     */
    public const FAMILLES = [
        'apartment' => self::FAMILLE_HABITATION,
        'house' => self::FAMILLE_HABITATION,
        'villa' => self::FAMILLE_HABITATION,
        'studio' => self::FAMILLE_HABITATION,
        'room' => self::FAMILLE_HABITATION,
        'land' => self::FAMILLE_FONCIER,
        'farm' => self::FAMILLE_FONCIER,
        'office' => self::FAMILLE_PROFESSIONNEL,
        'shop' => self::FAMILLE_PROFESSIONNEL,
        'warehouse' => self::FAMILLE_PROFESSIONNEL,
        'factory' => self::FAMILLE_PROFESSIONNEL,
        'garage' => self::FAMILLE_PROFESSIONNEL,
        'parking' => self::FAMILLE_PROFESSIONNEL,
        'hotel' => self::FAMILLE_PROFESSIONNEL,
        'resort' => self::FAMILLE_PROFESSIONNEL,
        'other' => self::FAMILLE_PROFESSIONNEL,
    ];

    /**
     * Les types qui comptent leurs pièces. `room` en est EXCLU : une chambre
     * seule n'est pas un F2, et son type porte déjà le mot « chambre ».
     *
     * @var list<string>
     */
    private const AVEC_PIECES = ['apartment', 'house', 'villa', 'studio'];

    /**
     * Les types dont on décrit les niveaux (« R+1 »).
     *
     * ⚠ `total_floors` est le NOMBRE DE NIVEAUX (« Nombre de niveaux » dans
     * le formulaire, `min:1` à la validation et dans le schéma zod), pas le
     * nombre d'étages au-dessus du sol : **R+n = total_floors − 1**. Une
     * villa de plain-pied a `total_floors = 1` et s'indexe « R+0 villa basse » ;
     * la première version de ce fichier l'indexait « R+1 », et une vraie R+1
     * « R+2 » — le seul `total_floors = 0` du dépôt était celui des tests,
     * écrit par la factory sans passer la validation (revue de PR 253).
     *
     * @var list<string>
     */
    private const AVEC_NIVEAUX = ['house', 'villa'];

    /** Le mot du marché pour un bien de plain-pied, PAR TYPE : « villa basse » sur une maison lui donnerait l'alias de type « villa » (revue de PR 253). @var array<string,string> */
    private const PLAIN_PIED = [
        'house' => 'maison basse plain-pied',
        'villa' => 'villa basse plain-pied',
    ];

    /** Les types qui ont un étage DANS un immeuble. @var list<string> */
    private const AVEC_ETAGE = ['apartment', 'office', 'studio', 'room'];

    /** Les types dont le nom est féminin — « Villa meublée », « Chambre meublée ». @var list<string> */
    private const NOM_FEMININ = ['house', 'villa', 'room'];

    /** Le plus haut R+n que `facts()` et `title()` émettent (soit `total_floors = 11`) ; le dictionnaire de l'index (config/scout.php) doit le couvrir. Au-delà, rien : un étage faux indexé vaut moins que pas d'étage. */
    public const NIVEAUX_MAX = 10;

    /** Les types pour lesquels le statut foncier décide de l'achat. @var list<string> */
    private const AVEC_STATUT_FONCIER = ['land', 'farm', 'house', 'villa'];

    /** @var array<string,string> */
    private const STATUT_FONCIER = [
        'titre_foncier' => 'titre foncier TF',
        'bail' => 'bail',
        'deliberation' => 'deliberation',
        'autre' => '',
    ];

    /** @var array<string,string> */
    private const STATUT_FONCIER_TITRE = [
        'titre_foncier' => 'titre foncier',
        'bail' => 'bail',
        'deliberation' => 'délibération',
        'autre' => '',
    ];

    /** @var array<string,string> */
    private const PERIODE = [
        'daily' => 'par jour journalier courte duree',
        'weekly' => 'par semaine hebdomadaire',
        'monthly' => 'par mois mensuel',
        'yearly' => 'par an annuel',
    ];

    public static function famille(PropertyType|string|null $type): ?string
    {
        $cle = $type instanceof PropertyType ? $type->value : $type;

        return $cle === null ? null : (self::FAMILLES[$cle] ?? null);
    }

    /** Un type qui compte ses chambres — ce que la factory et le seed consultent pour ne pas en poser ailleurs. */
    public static function comptePieces(PropertyType|string|null $type): bool
    {
        return in_array(self::cle($type), self::AVEC_PIECES, true);
    }

    public static function aUnEtage(PropertyType|string|null $type): bool
    {
        return in_array(self::cle($type), self::AVEC_ETAGE, true);
    }

    // ───────────────────────────────────────────────────────── rooms_label

    public static function rooms(Property $bien): string
    {
        $type = self::cle($bien->type);

        if (! in_array($type, self::AVEC_PIECES, true)) {
            return '';
        }

        // `bedrooms` n'a pas de cast sur le modèle : une chaîne « 0 » venue
        // d'un client HTTP doit rester un studio, pas « 0 chambres salon ».
        $chambres = $bien->bedrooms === null ? null : (int) $bien->bedrooms;

        if ($type === 'studio' || $chambres === 0) {
            return 'F1 T1 studio';
        }

        if ($chambres === null) {
            return '';
        }

        $pieces = $chambres + 1;

        // ⚠ UN SEUL chiffre nu par document, celui des chambres. Un document
        // est un sac de mots : « 4 pieces 3 chambres » porterait 3 ET 4, et
        // `q=4 chambres` rendrait ce bien. Mesuré le 2026-09-02 sur le corpus
        // de test (`PropertyDerivedVocabularyTest`) — « 4 pièces » n'est donc
        // pas couvert, et c'est le prix de la précision de « N chambres ».
        if ($chambres === 1) {
            return 'F2 T2 1 chambre salon';
        }

        return "F{$pieces} T{$pieces} {$chambres} chambres salon";
    }

    // ───────────────────────────────────────────────────────── facts_label

    public static function facts(Property $bien): string
    {
        $type = self::cle($bien->type);
        $famille = self::FAMILLES[$type] ?? null;
        $jetons = [];

        $rPlus = self::rPlus($type, $bien->total_floors);
        if ($rPlus !== null) {
            // « R+1 » n'est UN jeton que parce que le dictionnaire de l'index
            // le déclare (config/scout.php) ; sans lui le `+` sépare, et « 1 »
            // devient un chiffre nu qui répond à `q=1 chambre`. Mesuré.
            $jetons[] = "R+{$rPlus}";
            if ($rPlus === 0) {
                $jetons[] = self::PLAIN_PIED[$type];
            }
        }

        if (in_array($type, self::AVEC_ETAGE, true) && $bien->floor_number !== null) {
            $jetons[] = self::etage((int) $bien->floor_number);
        }

        if ($famille === self::FAMILLE_HABITATION && (int) $bien->bathrooms >= 1) {
            // Sans le compte, même raison que rooms() : un chiffre nu de plus
            // dans un document habitable dégrade « N chambres ».
            $jetons[] = 'sdb salle de bain salles de bain';
        }

        if ((int) $bien->parking_spaces >= 1) {
            // ⚠ NI « parking » NI « garage » : ce sont les alias des types
            // `parking` et `garage` (TYPE_SEARCH_ALIASES), et un fait qui porte
            // le mot d'un type rend ce type inatteignable par son propre nom.
            // Mesuré sur 795 documents locaux (revue de PR 253) : avec
            // « parking garage » ici, `q=garage` rendait 652 biens de 16 types
            // au lieu des 67 garages — 638 documents portaient le jeton.
            $jetons[] = 'stationnement';
        }

        if ($bien->area !== null && (int) $bien->area > 0) {
            $m2 = (int) $bien->area;
            $jetons[] = "{$m2} m2";
            if ($m2 >= 10_000) {
                $jetons[] = self::hectares($m2).' ha hectare';
            }
        }

        if (in_array($type, self::AVEC_STATUT_FONCIER, true)) {
            $statut = self::STATUT_FONCIER[self::cle($bien->title_type)] ?? '';
            if ($statut !== '') {
                $jetons[] = $statut;
            }
        }

        if (self::cle($bien->contract_type) === ContractType::Rent->value) {
            $periode = self::PERIODE[self::cle($bien->rent_period)] ?? '';
            if ($periode !== '') {
                $jetons[] = $periode;
            }
        }

        // Le SEUL fait relatif au temps de tout document indexé : figé à
        // l'indexation, il ne se périme que si quelque chose réindexe le bien.
        // Rien ne le faisait (revue de PR 253) — c'est le rôle du job quotidien
        // {@see \App\Jobs\RefreshNewBuildSearchLabel}, qui réindexe les biens
        // construits dans les trois dernières années.
        if ($bien->year_built !== null && (int) $bien->year_built >= self::anneeNeufMin()) {
            $jetons[] = 'neuf';
        }

        return implode(' ', $jetons);
    }

    // ───────────────────────────────────────────────────────── derived_title

    /**
     * Un titre écrit depuis les colonnes — « Appartement F4 meublé à Médina,
     * Dakar ». INDEX SEULEMENT : il n'est ni exposé ni affiché. Le libellé de
     * type est LU dans `lang/fr/properties.php`, jamais recopié.
     */
    public static function title(Property $bien, ?Address $adresse): string
    {
        $type = self::cle($bien->type);
        $famille = self::FAMILLES[$type] ?? self::FAMILLE_PROFESSIONNEL;
        $segments = [self::libelleType($type)];

        if ($famille === self::FAMILLE_HABITATION) {
            if ($type !== 'studio' && in_array($type, self::AVEC_PIECES, true) && $bien->bedrooms !== null) {
                $segments[] = 'F'.((int) $bien->bedrooms + 1);
            }
            if ($bien->furnished) {
                $segments[] = in_array($type, self::NOM_FEMININ, true) ? 'meublée' : 'meublé';
            }
            $rPlus = self::rPlus($type, $bien->total_floors);
            if ($rPlus !== null && $rPlus >= 1) {
                $segments[] = "R+{$rPlus}";
            }
        } else {
            if ($bien->area !== null && (int) $bien->area > 0) {
                $segments[] = ((int) $bien->area).' m²';
            }
            if ($famille === self::FAMILLE_FONCIER) {
                $statut = self::STATUT_FONCIER_TITRE[self::cle($bien->title_type)] ?? '';
                if ($statut !== '') {
                    $segments[] = $statut;
                }
            }
        }

        $lieu = self::lieu($adresse);
        if ($lieu !== '') {
            $segments[] = 'à '.$lieu;
        }

        return implode(' ', $segments);
    }

    // ───────────────────────────────────────────────────────── interne

    /** La première année de construction qui vaut « neuf » : l'année courante ou la précédente. */
    public static function anneeNeufMin(): int
    {
        return Carbon::now()->year - 1;
    }

    /**
     * Le « R+n » d'un bien, ou null quand il n'en a pas : type sans niveaux,
     * colonne vide, `total_floors = 0` (refusé par la validation, mais pas par
     * la base), ou au-delà de ce que le dictionnaire couvre.
     */
    private static function rPlus(?string $type, mixed $totalFloors): ?int
    {
        if (! in_array($type, self::AVEC_NIVEAUX, true) || $totalFloors === null) {
            return null;
        }

        $rPlus = (int) $totalFloors - 1;

        return $rPlus >= 0 && $rPlus <= self::NIVEAUX_MAX ? $rPlus : null;
    }

    /**
     * L'étage d'un bien dans son immeuble, en jetons entiers — jamais le
     * chiffre nu « 3 », qui ferait rendre ce bien à `q=3 chambres` (cf. rooms()).
     *
     * Trois cas mesurés sur Meilisearch 1.36 (revue de PR 253) :
     * - le premier s'écrit « 1er » / « premier », jamais « 1e » : à 3 lettres,
     *   aucune faute n'est tolérée, et « 1er » n'est pas un préfixe de « 1e » —
     *   `q=1er etage` rendait 0 ;
     * - un étage négatif s'écrivait « -1e etage », que le moteur découpe en
     *   « 1e etage » (le tiret sépare) : un sous-sol répondait au premier ;
     * - « 3e » et « 3eme » sont tous deux tapés, aucun n'est préfixe de l'autre.
     */
    private static function etage(int $n): string
    {
        return match (true) {
            $n < 0 => 'sous-sol',
            $n === 0 => 'rez-de-chaussee rdc',
            $n === 1 => '1er etage premier etage 1eme etage',
            default => "{$n}e etage {$n}eme etage",
        };
    }

    private static function cle(PropertyType|ContractType|RentPeriod|TitleType|string|null $valeur): ?string
    {
        return $valeur instanceof \BackedEnum ? (string) $valeur->value : $valeur;
    }

    private static function libelleType(?string $type): string
    {
        $cle = "properties.type.{$type}";
        $libelle = (string) trans($cle, [], 'fr');

        return $libelle === $cle ? ucfirst((string) $type) : $libelle;
    }

    private static function lieu(?Address $adresse): string
    {
        $quartier = trim((string) $adresse?->neighborhood);
        $ville = trim((string) $adresse?->city);

        return match (true) {
            $quartier !== '' && $ville !== '' => "{$quartier}, {$ville}",
            $ville !== '' => $ville,
            $quartier !== '' => $quartier,
            default => '',
        };
    }

    /** `15000` → `1.5`, `20000` → `2` : un entier quand c'est rond, une décimale sinon. */
    private static function hectares(int $m2): string
    {
        $ha = round($m2 / 10_000, 1);

        return $ha === floor($ha) ? (string) (int) $ha : rtrim(rtrim(number_format($ha, 1, '.', ''), '0'), '.');
    }
}
