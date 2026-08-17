#!/usr/bin/env php
<?php

/**
 * Lance les seuls tests que le diff courant touche.
 *
 * Usage :
 *   php bin/impacted-tests.php              # ce que dit `git status` (l'agent qui itère)
 *   php bin/impacted-tests.php --base=dev   # + tout ce qui sépare HEAD de `dev`
 *   php bin/impacted-tests.php --run        # exécute au lieu d'afficher la commande
 *
 * ⚠ UN VERT DE CETTE COMMANDE NE DIT RIEN DE LA SUITE. C'est une boucle de retour
 * rapide pendant le développement, pas une garde. La CI et le rituel de fin de
 * branche continuent de jouer les ~2400 tests. Une carte périmée coûte alors une
 * découverte tardive — jamais une régression mergée.
 */

require __DIR__.'/../vendor/autoload.php';

use Tests\Support\ImpactMap;
use Tests\Support\ImpactSelector;

if (! class_exists(ImpactMap::class)) {
    fwrite(STDERR, "✗ Tests\\Support\\ImpactMap est introuvable (`composer install --no-dev` ?).\n");
    exit(1);
}

$api = realpath(__DIR__.'/..');
$root = realpath($api.'/..');
$mapPath = $api.'/tests/impact-map.json';

$base = null;
$run = false;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--run') {
        $run = true;
    } elseif (str_starts_with($arg, '--base=')) {
        $base = substr($arg, strlen('--base='));
    } else {
        fwrite(STDERR, "argument inconnu : $arg\n");
        exit(1);
    }
}

$git = function (string $args) use ($root): array {
    exec('git -C '.escapeshellarg($root).' '.$args.' 2>/dev/null', $out, $code);

    return [$out, $code];
};

// ── La carte ────────────────────────────────────────────────────────────────
if (! is_file($mapPath)) {
    fwrite(STDERR, "✗ carte absente : tests/impact-map.json\n".
        "  Elle est engendrée par la CI sur push vers `dev`. En attendant, lancer la suite\n".
        "  entière : php artisan test\n");
    exit(1);
}

$map = ImpactMap::fromJson(file_get_contents($mapPath));

// ── Les fichiers modifiés ───────────────────────────────────────────────────
// `git status --porcelain` couvre l'arbre de travail ET les fichiers non suivis —
// c'est exactement le cas de l'agent qui itère, et le seul qui compte au quotidien.
[$statusLines] = $git('status --porcelain');
$changed = [];
foreach ($statusLines as $line) {
    $path = trim(substr($line, 3));
    // Un renommage s'écrit `R  ancien -> nouveau` : les DEUX côtés comptent.
    foreach (explode(' -> ', $path) as $part) {
        $changed[trim($part, '"')] = true;
    }
}

if ($base !== null) {
    [$diffLines, $code] = $git('diff --name-only '.escapeshellarg($base).'...HEAD');
    if ($code !== 0) {
        fwrite(STDERR, "✗ `git diff $base...HEAD` a échoué. Référence inconnue ?\n");
        exit(1);
    }
    foreach ($diffLines as $path) {
        $changed[$path] = true;
    }
}

// ── La réparation de péremption ─────────────────────────────────────────────
// Une carte vieille de deux semaines ne connaît pas les tests écrits depuis. Les
// ajouter d'office referme le trou « un test neuf couvre mon fichier » pour un coût
// nul. Si le commit de la carte est introuvable (clone superficiel), on ESCALADE :
// une réparation qu'on ne peut pas faire ne se présume pas faite.
[$sinceLines, $sinceCode] = $git('diff --name-only '.escapeshellarg($map->commit()).'..HEAD -- takussan-api/tests');
$stalenessKnown = $sinceCode === 0;
$testClassesSince = [];
foreach ($sinceLines as $path) {
    if (str_starts_with($path, 'takussan-api/')) {
        $class = ImpactMap::classForFile(substr($path, strlen('takussan-api/')));
        if ($class !== null) {
            $testClassesSince[] = $class;
        }
    }
}

[$ahead] = $git('rev-list --count '.escapeshellarg($map->commit()).'..HEAD');
$age = (int) round((time() - strtotime($map->generatedAt())) / 86400);

printf(
    "carte : %s · engendrée il y a %d jour(s) · %s commit(s) en arrière\n",
    substr($map->commit(), 0, 8),
    $age,
    $stalenessKnown ? ($ahead[0] ?? '?') : 'historique incomplet',
);

// ── La décision ─────────────────────────────────────────────────────────────
$diffFor = function (string $path) use ($git): string {
    [$lines] = $git('diff --unified=0 -- '.escapeshellarg($path));

    return implode("\n", $lines);
};

if (! $stalenessKnown) {
    fwrite(STDERR, "⚠ le commit de la carte est introuvable dans l'historique (clone superficiel ?).\n".
        "  La réparation de péremption est impossible → suite entière.\n");
    $command = 'php artisan test';
} else {
    $selection = (new ImpactSelector($map))->select(array_keys($changed), $diffFor, $testClassesSince);

    if ($selection->fullSuite) {
        printf("règle : SUITE ENTIÈRE — %s\n", $selection->reason);
        $command = 'php artisan test';
    } elseif ($selection->classes === []) {
        echo "règle : rien à lancer — aucun fichier modifié n'est couvert par un test.\n";
        exit(0);
    } else {
        printf("règle : sélection partielle — %d classe(s)\n", count($selection->classes));
        foreach ($selection->testFiles() as $file) {
            printf("  %s\n", $file);
        }
        $command = 'php artisan test '.implode(' ', array_map('escapeshellarg', $selection->testFiles()));
    }
}

if (! $run) {
    printf("\ncommande :\n  %s\n", $command);
    exit(0);
}

chdir($api);
passthru($command, $code);
exit($code);
