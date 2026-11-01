<?php

use Illuminate\Foundation\Bootstrap\LoadConfiguration;
use Illuminate\Foundation\Bootstrap\LoadEnvironmentVariables;
use Illuminate\Foundation\Bootstrap\RegisterFacades;
use Illuminate\Foundation\Bootstrap\RegisterProviders;

/**
 * Ce qu'un fichier d'environnement change à la configuration de l'API (TCK-2456).
 *
 *   php comparer-config-env.php <fichier-env>                  # le fichier contre les défauts de config/
 *   php comparer-config-env.php <fichier-env> --contre-courant # le fichier contre l'environnement du processus
 *
 * À lancer depuis la racine de l'API (`/app` dans le conteneur `api`), par PHP seul. Il charge deux fois
 * `config()->all()`, sans cache et sans `.env`, dans deux processus qui diffèrent par le seul environnement :
 *
 *   · par défaut, les clés du fichier sont retirées du premier et posées dans le second : il répond à
 *     « cette ligne vide a-t-elle écrasé un défaut de config/ ? » ;
 *   · `--contre-courant` garde l'environnement tel quel d'un côté, et le recouvre du fichier de l'autre : il
 *     répond à « que changerait ce fichier au conteneur qui tourne ? ». Il compare aussi les clés elles-mêmes, par
 *     empreinte : `TRUSTED_PROXIES`, `RESEND_BASE_URL` ou `SEED_*` se lisent hors de `config()`, et aucun chemin ne
 *     les montre.
 *
 * Sort en 0, en 2 sur une erreur, et en 3 quand `--contre-courant` trouve une clé posée que le fichier viderait :
 * une `APP_KEY` vidée laisse `/up` à 200, l'application cassée. Rien de ce qu'on perd ainsi ne se voit au déploiement.
 *
 * ⚠ Il n'imprime QUE des chemins de configuration et des noms de clés, jamais une valeur : un tableau en liste
 * compte pour un seul chemin, l'erreur d'un enfant se réduit à sa classe, et sa sortie d'erreur est jetée. Les
 * valeurs ne quittent l'enfant qu'en empreinte, par un tube, sans rien écrire sur le disque.
 */
if (($argv[1] ?? null) === '--enfant') {
    ini_set('display_errors', '0');
    enfant();
    exit(0);
}

$fichier = $argv[1] ?? null;
$contreCourant = in_array('--contre-courant', $argv, true);

if ($fichier === null || str_starts_with($fichier, '--')) {
    fwrite(STDERR, "usage : php comparer-config-env.php <fichier-env> [--contre-courant]\n");
    exit(2);
}
if (! is_file($fichier)) {
    fwrite(STDERR, "fichier introuvable : {$fichier}\n");
    exit(2);
}
if (! is_readable($fichier)) {
    // Le cas de `docker cp` : le fichier arrive en root:root, et le conteneur tourne en www-data.
    fwrite(STDERR, "fichier illisible par cet utilisateur (droits ou propriétaire) : {$fichier}\n");
    exit(2);
}
if (! is_file(getcwd().'/vendor/autoload.php') || ! is_file(getcwd().'/bootstrap/app.php')) {
    fwrite(STDERR, "à lancer depuis la racine de l'API (/app dans le conteneur) : vendor/ ou bootstrap/ introuvable.\n");
    exit(2);
}

require getcwd().'/vendor/autoload.php';

$contenu = (string) file_get_contents($fichier);
try {
    $clesDuFichier = Dotenv\Dotenv::parse($contenu);
} catch (Throwable $e) {
    // Le message de phpdotenv cite la ligne fautive : il peut porter une valeur.
    fwrite(STDERR, 'fichier illisible par phpdotenv ('.$e::class.")\n");
    exit(2);
}
if ($clesDuFichier === []) {
    fwrite(STDERR, "le fichier ne déclare aucune clé : rien à comparer.\n");
    exit(2);
}
// phpdotenv avale sans erreur la suite d'un guillemet non fermé : la ligne disparaît, et avec elle sa clé.
preg_match_all('/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/m', $contenu, $lignes);
$avalees = array_values(array_unique(array_diff($lignes[1], array_keys($clesDuFichier))));
if ($avalees !== []) {
    fwrite(STDERR, 'lignes non lues, guillemet non fermé au-dessus ou sur elles : '.implode(', ', $avalees)."\n");
    exit(2);
}

$courant = getenv();
$sans = $contreCourant ? $courant : array_diff_key($courant, $clesDuFichier);
$avec = array_replace($courant, $clesDuFichier);

$a = charger($sans);
$b = charger($avec);

$changes = [];
$videAuLieuDeNull = [];
foreach (array_unique([...array_keys($a), ...array_keys($b)]) as $chemin) {
    $x = $a[$chemin] ?? null;
    $y = $b[$chemin] ?? null;
    if ($x === $y) {
        continue;
    }
    if (($x === 'null' && $y === 'vide') || ($x === 'vide' && $y === 'null')) {
        $videAuLieuDeNull[] = $chemin;
    } else {
        $changes[] = $chemin;
    }
}
sort($changes);
sort($videAuLieuDeNull);

printf("%d clés dans le fichier, %d chemins de configuration lus.\n", count($clesDuFichier), count($b));
imprimer('Chemins dont la valeur change', $changes);
imprimer('Chemins qui passent de null à une chaîne vide (ou l\'inverse)', $videAuLieuDeNull);

if ($contreCourant) {
    // Ce que l'image et le système posent, et que l'onglet Environment ne porte jamais.
    $systeme = '/^(PATH|HOME|HOSTNAME|PWD|OLDPWD|SHLVL|TERM|USER|LOGNAME|SHELL|LANG|LC_\w+|_|BUILD_SHA|REDIS_HOST|REDIS_PORT|PHP\w*|GPG_KEYS|CADDY\w*|FRANKENPHP\w*|SERVER_NAME|XDG_\w+|GODEBUG|APP_CONFIG_CACHE|COMPOSER\w*|COMPOSE_PROJECT_NAME|DOCKER_CONFIG)$/';
    $perdues = array_values(array_filter(
        array_keys(array_diff_key($courant, $clesDuFichier)),
        static fn ($cle): bool => is_string($cle) && preg_match($systeme, $cle) !== 1,
    ));
    sort($perdues);
    imprimer('Clés posées dans l\'environnement, absentes du fichier', $perdues);

    $differentes = [];
    $neuves = [];
    $videes = [];
    foreach ($clesDuFichier as $cle => $valeur) {
        $posee = $courant[$cle] ?? null;
        if ($posee === null) {
            if ($valeur !== '') {
                $neuves[] = $cle;
            }
        } elseif ($posee !== '' && $valeur === '') {
            $videes[] = $cle;
        } elseif (! hash_equals(hash('sha256', $posee), hash('sha256', $valeur))) {
            $differentes[] = $cle;
        }
    }
    sort($differentes);
    sort($neuves);
    sort($videes);
    imprimer('Clés dont la valeur diffère du courant', $differentes);
    imprimer('Clés du fichier, non vides, absentes du courant', $neuves);
    imprimer('Posées dans le courant, vides dans le fichier', $videes);
    if ($videes !== []) {
        exit(3);
    }
}

/** @param array<string, string> $env @return array<string, string> chemin => empreinte */
function charger(array $env): array
{
    // Un fichier absent : la configuration en cache d'`entrypoint.sh` ne doit pas répondre à la place de config/.
    $env['APP_CONFIG_CACHE'] = sys_get_temp_dir().'/comparer-config-env-absent-'.bin2hex(random_bytes(6)).'.php';
    // ⚠ `proc_open` saute en silence toute variable de valeur vide : c'est pourtant tout ce que ce script
    // doit voir (`env('X', 'd')` rend '' sur une ligne vide). Leurs noms passent à part, et l'enfant les pose.
    $env['COMPARER_CONFIG_VIDES'] = implode(',', array_keys(array_filter($env, static fn ($v): bool => $v === '')));
    $processus = proc_open(
        [PHP_BINARY, __FILE__, '--enfant'],
        [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'w']],
        $tubes,
        getcwd(),
        $env,
    );
    if (! is_resource($processus)) {
        fwrite(STDERR, "impossible de lancer PHP.\n");
        exit(2);
    }
    $sortie = (string) stream_get_contents($tubes[1]);
    fclose($tubes[1]);
    $code = proc_close($processus);
    $lu = json_decode($sortie, true);
    if ($code !== 0 || ! is_array($lu) || ! isset($lu['config'])) {
        fwrite(STDERR, 'la configuration ne se charge pas : '.(is_array($lu) ? (string) ($lu['erreur'] ?? 'inconnue') : "sortie illisible (code $code)")."\n");
        exit(2);
    }

    return $lu['config'];
}

function enfant(): void
{
    try {
        foreach (array_filter(explode(',', (string) getenv('COMPARER_CONFIG_VIDES'))) as $cle) {
            putenv($cle.'=');
            $_SERVER[$cle] = '';
            $_ENV[$cle] = '';
        }
        require getcwd().'/vendor/autoload.php';
        $app = require getcwd().'/bootstrap/app.php';
        // Un nom sans fichier : un `.env` local ne doit pas compléter l'environnement du processus.
        $app->loadEnvironmentFrom('.env.comparer-config-absent');
        $app->bootstrapWith([
            LoadEnvironmentVariables::class,
            LoadConfiguration::class,
            RegisterFacades::class,
            RegisterProviders::class,
        ]);
        echo json_encode(['config' => aplatir($app->make('config')->all())], JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        // La classe seule : un message peut citer une valeur.
        echo json_encode(['erreur' => $e::class]);
        exit(1);
    }
}

/** @return array<string, string> */
function aplatir(array $tableau, string $prefixe = ''): array
{
    $plat = [];
    foreach ($tableau as $cle => $valeur) {
        $chemin = $prefixe.$cle;
        if (is_array($valeur) && $valeur !== [] && ! array_is_list($valeur)) {
            $plat += aplatir($valeur, $chemin.'.');
        } else {
            $plat[$chemin] = empreinte($valeur);
        }
    }

    return $plat;
}

/** `null` et `vide` restent lisibles : c'est leur écart qu'on veut voir, et ils ne disent rien d'un secret. */
function empreinte(mixed $valeur): string
{
    return match (true) {
        $valeur === null => 'null',
        $valeur === '' => 'vide',
        // `env()` rend une chaîne là où le défaut de config/ est un entier : '30' et 30 sont la même valeur.
        is_bool($valeur) => $valeur ? 'vrai' : 'faux',
        is_int($valeur), is_float($valeur), is_string($valeur) => hash('sha256', 's:'.$valeur),
        is_array($valeur) => hash('sha256', 'a:'.json_encode(array_map(empreinte(...), $valeur))),
        default => 'o:'.get_debug_type($valeur),
    };
}

/** @param list<string> $chemins */
function imprimer(string $titre, array $chemins): void
{
    printf("\n%s : %d\n", $titre, count($chemins));
    foreach ($chemins as $chemin) {
        echo "  {$chemin}\n";
    }
}
