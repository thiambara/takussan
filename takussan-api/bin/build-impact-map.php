#!/usr/bin/env php
<?php

/**
 * Réduit un rapport `--coverage-php` de PHPUnit en carte d'impact.
 *
 * Usage :
 *   php bin/build-impact-map.php storage/coverage/cov.php [tests/impact-map.json]
 *
 * ⚠ CE SCRIPT NE VIT PAS SOUS `app/`, ET C'EST DÉLIBÉRÉ. `phpunit.xml` déclare
 * `<source><include><directory>app</directory></include></source>` : une commande
 * artisan placée là entrerait au dénominateur du cliquet `--min=86`, dont la marge
 * mesurée n'est que de 0,3 point (~74 lignes). Un outil de développement n'a pas à
 * dépenser la marge de couverture de l'application — ni à être livré en production.
 *
 * La LOGIQUE est dans `Tests\Support\ImpactMap`, qui est testée. Ce fichier est une
 * enveloppe mince : lecture d'arguments, parcours de `app/`, écriture.
 */

require __DIR__.'/../vendor/autoload.php';

if (! class_exists(Tests\Support\ImpactMap::class)) {
    fwrite(STDERR, "✗ Tests\\Support\\ImpactMap est introuvable.\n".
        "  L'espace de noms `Tests\\` vit dans `autoload-dev` : ce script ne fonctionne pas\n".
        "  après un `composer install --no-dev`.\n");
    exit(1);
}

$coveragePath = $argv[1] ?? null;
$outputPath = $argv[2] ?? __DIR__.'/../tests/impact-map.json';

if ($coveragePath === null || ! is_file($coveragePath)) {
    fwrite(STDERR, "usage : php bin/build-impact-map.php <rapport --coverage-php> [sortie.json]\n");
    exit(1);
}

$root = realpath(__DIR__.'/..');
$coverage = include $coveragePath;

if (! $coverage instanceof SebastianBergmann\CodeCoverage\CodeCoverage) {
    fwrite(STDERR, "✗ $coveragePath n'est pas un rapport `--coverage-php` de PHPUnit.\n");
    exit(1);
}

// Le périmètre SCANNÉ, et non le périmètre couvert : c'est cette liste qui permet
// de distinguer « fichier que personne ne teste » (rien à lancer) de « fichier
// inconnu de la carte » (suite entière). Sans elle, 36 commits sur 172 escaladaient
// à tort — mesuré le 2026-08-17.
$scanned = [];
$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/app', FilesystemIterator::SKIP_DOTS));
foreach ($iterator as $file) {
    if ($file->isFile() && $file->getExtension() === 'php') {
        $scanned[] = substr($file->getPathname(), strlen($root) + 1);
    }
}

$commit = trim((string) shell_exec('git -C '.escapeshellarg($root).' rev-parse HEAD 2>/dev/null'));

if ($commit === '') {
    fwrite(STDERR, "✗ impossible de lire le commit courant (`git rev-parse HEAD`).\n".
        "  La carte porte le commit qui l'a engendrée : c'est ce qui permet de rattraper\n".
        "  sa péremption. Sans lui, elle serait un faux vert en puissance.\n");
    exit(1);
}

$map = Tests\Support\ImpactMap::fromCoverage(
    $coverage->getData()->lineCoverage(),
    $root,
    $scanned,
    $commit,
    gmdate('c'),
);

file_put_contents($outputPath, json_encode($map, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");

printf(
    "carte écrite : %s\n  %d classes de test · %d fichiers couverts sur %d scannés · %.2f Mo\n",
    $outputPath,
    count($map['classes']),
    count($map['files']),
    count($map['scanned']),
    filesize($outputPath) / 1048576,
);
