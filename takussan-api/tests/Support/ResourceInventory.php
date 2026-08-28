<?php

namespace Tests\Support;

use App\Http\Resources\Accounting\MatchCandidateResource;
use App\Http\Resources\Api\Admin\AgencyDetailResource;
use App\Http\Resources\Api\Admin\AgencyProvisioningResource;
use App\Http\Resources\Api\Admin\ModerationItemResource;
use App\Http\Resources\Api\Admin\UserDetailResource;
use App\Http\Resources\Api\Admin\UserListResource;
use App\Http\Resources\Api\Me\ProfileResource;
use App\Http\Resources\DocumentVersionResource;
use App\Http\Resources\MediaResource;
use App\Http\Resources\PropertyMapGeoJsonResource;
use App\Http\Resources\PropertySitemapResource;
use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use ReflectionClass;
use SplFileInfo;
use Symfony\Component\Finder\Finder;

/**
 * L'inventaire DÉRIVÉ des ressources d'API — TCK-327, AC2.
 *
 * **Pourquoi cette classe existe.** `scripts/check-resource-date-format.mjs` reconnaît une date
 * à son NOM de clé (`*_at`, `*_date`, `*_since`, `period_start`…). C'est un plancher, jamais un
 * inventaire : `member_since` lui échappait jusqu'à ce qu'on ajoute `_since`, et rien n'aurait
 * signalé une clé nommée `horodatage`. *Une garde qui ne peut pas énumérer sa cible ne peut pas
 * établir un « toutes ».* C'est très exactement le motif pour lequel AC2 a été décoché le
 * 2026-08-20 après avoir été coché à tort.
 *
 * Cette classe-ci n'énumère pas des clés : elle énumère les **fichiers** de
 * `app/Http/Resources/`, et rend de quoi INSTANCIER chacun. `DateInventoryTest` regarde ensuite
 * ce que la ressource ÉMET, valeur par valeur. Une date s'y reconnaît à ce qu'elle est, pas à
 * comment on l'a nommée.
 *
 * **La propriété qui compte n'est pas « les 45 ressources sont couvertes » — c'est « une
 * ressource NOUVELLE ne peut pas entrer sans être soit éprouvée, soit inscrite ».** Un
 * dispositif qui se vide en silence est pire qu'aucun dispositif : il continue d'afficher son
 * vert. Les trois registres ci-dessous sont donc gardés dans les DEUX sens par
 * {@see self::anomaliesDuRegistre()} — une entrée sans fichier réel rougit, un fichier sans
 * entrée rougit.
 *
 * Le patron (Finder + ReflectionClass + cache statique) est copié de {@see SearchableModels},
 * pour la même raison qu'elle : *aucune liste maintenue à la main ne reste juste ; seule une
 * liste dérivée le reste.*
 */
final class ResourceInventory
{
    /**
     * Racine des ressources, résolue par le chemin du fichier et NON par `app_path()` :
     * les `#[DataProvider]` de PHPUnit sont appelés avant qu'un conteneur Laravel n'existe.
     */
    private const RESOURCES_PATH = __DIR__.'/../../app/Http/Resources';

    /**
     * Les ressources que la convention `<Modele>Resource` ne résout pas, et le modèle qu'elles
     * enveloppent réellement. Chaque entrée porte la raison de l'écart de nommage.
     *
     * Ce n'est PAS une liste d'exemptions : ces ressources sont éprouvées comme les autres.
     * C'est une table de correspondance que le nom ne suffit pas à déduire.
     *
     * @var array<class-string, array{modeles: array<int,class-string>, raison: string}>
     */
    public const MODELES_EXPLICITES = [
        AgencyDetailResource::class => [
            'modeles' => [Agency::class],
            'raison' => "Vue « détail » d'une agence pour l'admin — le suffixe `Detail` casse la convention.",
        ],
        UserDetailResource::class => [
            'modeles' => [User::class],
            'raison' => "Vue « détail » d'un utilisateur pour l'admin — le suffixe `Detail` casse la convention.",
        ],
        UserListResource::class => [
            'modeles' => [User::class],
            'raison' => "Vue « liste » d'un utilisateur pour l'admin — le suffixe `List` casse la convention.",
        ],
        PropertyMapGeoJsonResource::class => [
            'modeles' => [Property::class],
            'raison' => 'Enveloppe un Property sous une Feature GeoJSON — le nom décrit le format de sortie, pas le modèle.',
        ],
        PropertySitemapResource::class => [
            'modeles' => [Property::class],
            'raison' => 'Enveloppe un Property sous les deux clés que le protocole sitemap attend '
                .'(`slug`, `updated_at`) — même écart de nommage que la GeoJSON juste au-dessus : '
                .'le suffixe décrit le FORMAT DE SORTIE, pas le modèle. Ajoutée par TCK-431 et '
                .'oubliée ici ; la garde de registre est le seul mécanisme qui l\'ait dit.',
        ],
        ProfileResource::class => [
            'modeles' => [
                OwnerProfile::class,
                AgentProfile::class,
                AgencyAdminProfile::class,
                BrokerProfile::class,
                ServiceProviderProfile::class,
            ],
            'raison' => '« Profil » est POLYMORPHE : cinq tables distinctes, aucun modèle `Profile`. '
                .'Les cinq sont éprouvés, pas un représentant — le principe non négociable n°1 en fait '
                .'cinq contrats et non un.',
        ],
    ];

    /**
     * Les ressources qu'AUCUN modèle Eloquent n'adosse, et la forme du sujet qu'il faut leur
     * fabriquer à la main. Elles sont éprouvées comme les autres : {@see ResourceSubjects}
     * construit le sujet, le test lit la sortie.
     *
     * *Une ressource éprouvée vaut mieux qu'une ressource excusée* — d'où le fait que ce registre
     * ne soit pas une liste d'exemptions mais une liste de recettes.
     *
     * @var array<class-string, string>
     */
    public const SUJETS_SUR_MESURE = [
        MatchCandidateResource::class => 'Enveloppe un DTO `readonly` (`App\\Services\\Accounting\\MatchCandidate`), pas un modèle : construit par appel direct au constructeur.',
        ModerationItemResource::class => "Enveloppe un TABLEAU issu d'un `selectRaw` unifié — ses colonnes n'ont jamais traversé un cast Eloquent, elles arrivent en chaîne SQL brute. C'est la « cinquième forme » qui a fait décocher AC2.",
        AgencyProvisioningResource::class => "Enveloppe un tableau `{agency, admin}` de deux modèles déjà persistés : le sujet est le tableau, pas l'un des deux.",
        MediaResource::class => 'Enveloppe un `Spatie\\MediaLibrary\\…\\Media`, modèle d\'un paquet tiers sans factory : instancié à la main avec des attributs concrets (`getUrl()` exige `disk`, `id`, `file_name`).',
        DocumentVersionResource::class => 'Même sujet `Media` que ci-dessus, lu par ses `custom_properties` de version.',
    ];

    /**
     * Les ressources qu'on n'a PAS su éprouver, et pourquoi.
     *
     * ⚠ **Ce registre est vide, et c'est un résultat mesuré le 2026-08-22, pas un oubli.** Les dix
     * ressources que TCK-327 pressentait non énumérables (cinq modèles sans factory, cinq
     * non-modèles) le sont toutes : les premières par `new Modele` non persisté, les secondes par
     * les recettes de {@see self::SUJETS_SUR_MESURE}.
     *
     * Il reste ÉCRIT, et gardé dans les deux sens, parce que sa raison d'être n'est pas de porter
     * des entrées : c'est d'être le seul endroit où une ressource peut légitimement échapper au
     * test. Sans lui, la seule issue pour une ressource récalcitrante serait de la retirer du
     * parcours en silence.
     *
     * @var array<class-string, string>
     */
    public const NON_ENUMERABLES = [];

    /** @var array<int,class-string>|null */
    private static ?array $cache = null;

    /**
     * Toute classe CONCRÈTE de `app/Http/Resources` — l'abstraite `BaseResource` exclue.
     *
     * @return array<int,class-string>
     */
    public static function toutes(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $classes = [];

        foreach (Finder::create()->files()->in(self::RESOURCES_PATH)->name('*.php') as $file) {
            $class = self::classFor($file);

            if ($class === null || ! class_exists($class)) {
                continue;
            }

            if ((new ReflectionClass($class))->isAbstract()) {
                continue;
            }

            $classes[] = $class;
        }

        sort($classes);

        return self::$cache = $classes;
    }

    /**
     * Les modèles qu'une ressource enveloppe : la convention `<Modele>Resource` d'abord,
     * {@see self::MODELES_EXPLICITES} ensuite. Vide si la ressource n'adosse aucun modèle.
     *
     * @return array<int,class-string>
     */
    public static function modelesPour(string $resource): array
    {
        if (isset(self::MODELES_EXPLICITES[$resource])) {
            return self::MODELES_EXPLICITES[$resource]['modeles'];
        }

        $court = preg_replace('/Resource$/', '', class_basename($resource));
        $modele = 'App\\Models\\'.$court;

        return class_exists($modele) ? [$modele] : [];
    }

    /**
     * Les ressources que le test doit éprouver : tout ce qui n'est pas inscrit
     * {@see self::NON_ENUMERABLES}.
     *
     * @return array<int,class-string>
     */
    public static function enumerables(): array
    {
        return array_values(array_filter(
            self::toutes(),
            fn (string $r) => ! array_key_exists($r, self::NON_ENUMERABLES),
        ));
    }

    /**
     * **Le contrôle qui empêche le dispositif de pourrir, dans les deux sens.**
     *
     * 1. une entrée de registre qui ne correspond plus à un fichier réel → anomalie (c'est le
     *    défaut que `EXCEPTIONS_JUSTIFIEES` de la garde statique attrape déjà : *une autorisation
     *    qui survit à son motif est le mécanisme par lequel une liste devient une passoire*) ;
     * 2. une ressource NOUVELLE que ni la convention, ni les modèles explicites, ni les recettes,
     *    ni les non-énumérables ne couvrent → anomalie. **C'est le point le plus important** :
     *    sans lui, ajouter une ressource sortirait du périmètre sans rien faire rougir ;
     * 3. une même ressource inscrite à deux registres, ou un modèle inscrit qui n'existe pas ;
     * 4. une raison écrite vide — une exemption sans motif n'en est pas une.
     *
     * @return array<int,string>
     */
    public static function anomaliesDuRegistre(): array
    {
        $toutes = self::toutes();
        $connues = array_flip($toutes);
        $anomalies = [];

        $registres = [
            'MODELES_EXPLICITES' => array_keys(self::MODELES_EXPLICITES),
            'SUJETS_SUR_MESURE' => array_keys(self::SUJETS_SUR_MESURE),
            'NON_ENUMERABLES' => array_keys(self::NON_ENUMERABLES),
        ];

        $vus = [];

        foreach ($registres as $nom => $cles) {
            foreach ($cles as $cle) {
                if (! isset($connues[$cle])) {
                    $anomalies[] = "{$nom} inscrit « {$cle} », qui n'est plus une ressource concrète de "
                        .'app/Http/Resources/. Une entrée qui survit à son fichier est le mécanisme par '
                        .'lequel un registre devient une passoire : la retirer.';

                    continue;
                }

                if (isset($vus[$cle])) {
                    $anomalies[] = "« {$cle} » est inscrit à la fois dans {$vus[$cle]} et dans {$nom} : "
                        .'un sujet, un registre.';
                }

                $vus[$cle] = $nom;
            }
        }

        foreach (self::MODELES_EXPLICITES as $resource => $entree) {
            if (trim($entree['raison']) === '') {
                $anomalies[] = "MODELES_EXPLICITES[{$resource}] n'écrit aucune raison.";
            }

            if ($entree['modeles'] === []) {
                $anomalies[] = "MODELES_EXPLICITES[{$resource}] ne nomme aucun modèle.";
            }

            foreach ($entree['modeles'] as $modele) {
                if (! class_exists($modele)) {
                    $anomalies[] = "MODELES_EXPLICITES[{$resource}] nomme « {$modele} », classe inexistante.";
                }
            }
        }

        foreach ([self::SUJETS_SUR_MESURE, self::NON_ENUMERABLES] as $registre) {
            foreach ($registre as $resource => $raison) {
                if (trim((string) $raison) === '') {
                    $anomalies[] = "« {$resource} » est inscrit sans raison écrite. Une exemption sans "
                        .'motif est une exemption qu\'on ne pourra jamais réexaminer.';
                }
            }
        }

        foreach ($toutes as $resource) {
            if (isset($vus[$resource])) {
                continue;
            }

            if (self::modelesPour($resource) !== []) {
                continue;
            }

            $anomalies[] = "« {$resource} » n'est adossée à AUCUN modèle par la convention "
                .'`<Modele>Resource`, et n\'est inscrite à aucun registre. Le dispositif ne peut donc '
                ."ni l'éprouver ni justifier de ne pas l'éprouver — et il ne se videra pas en silence. "
                .'Trois issues, dans cet ordre de préférence : lui donner une recette dans '
                .'ResourceSubjects + SUJETS_SUR_MESURE ; la déclarer dans MODELES_EXPLICITES si elle '
                .'enveloppe bien un modèle sous un autre nom ; l\'inscrire en NON_ENUMERABLES avec la '
                .'raison écrite de ce qui a empêché de l\'éprouver.';
        }

        sort($anomalies);

        return $anomalies;
    }

    /** @return class-string|null */
    private static function classFor(SplFileInfo $file): ?string
    {
        $root = realpath(self::RESOURCES_PATH);
        $path = $file->getRealPath() ?: $file->getPathname();

        if ($root === false || ! str_starts_with($path, $root)) {
            return null;
        }

        $relative = substr($path, strlen($root) + 1, -strlen('.php'));

        /** @var class-string $class */
        $class = 'App\\Http\\Resources\\'.str_replace(DIRECTORY_SEPARATOR, '\\', $relative);

        return $class;
    }
}
