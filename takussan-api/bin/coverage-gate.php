#!/usr/bin/env php
<?php

use Tests\Support\CoverageGate;

/**
 * Le cliquet de couverture (TCK-302), évalué depuis le clover (TCK-331).
 *
 * Usage :
 *   php bin/coverage-gate.php storage/coverage/clover.xml --min=86
 *
 * ⚠ CE SCRIPT NE VIT PAS SOUS `app/`, ET C'EST DÉLIBÉRÉ — même raison que
 * `bin/build-impact-map.php` : `phpunit.xml` déclare `<source><include>app</include></source>`,
 * et un outil de développement placé là entrerait au DÉNOMINATEUR du cliquet qu'il calcule.
 *
 * La LOGIQUE est dans `Tests\Support\CoverageGate`, qui est testée
 * (`tests/Unit/Testing/CoverageGateTest.php`). Ce fichier est une enveloppe mince :
 * lecture d'arguments, lecture du fichier, impression, code de sortie.
 *
 * ─── POURQUOI IL EXISTE ─────────────────────────────────────────────────────────────
 *
 * `artisan test --coverage --min=86` n'évalue le seuil que si Collision a pu relire son
 * propre rapport `--coverage-php`. Le jour où cette option a été passée une seconde fois
 * en ligne de commande, PHPUnit l'a écartée et le step est sorti en **1 sans imprimer un
 * chiffre**, sur une suite verte à 86,33 %. Un cliquet dont l'évaluation dépend d'un
 * canal invisible n'est pas un cliquet.
 *
 * Ici, TOUTE issue est bruyante : pas de fichier, fichier vide, clover tronqué, zéro ligne
 * exécutable, ou couverture sous le seuil — chacune sort en 1 avec sa raison écrite.
 */

require __DIR__.'/../vendor/autoload.php';

if (! class_exists(CoverageGate::class)) {
    fwrite(STDERR, "✗ Tests\\Support\\CoverageGate est introuvable.\n".
        "  L'espace de noms `Tests\\` vit dans `autoload-dev` : ce script ne fonctionne pas\n".
        "  après un `composer install --no-dev`.\n");
    exit(1);
}

$cloverPath = null;
$min = null;

foreach (array_slice($argv, 1) as $arg) {
    if (str_starts_with($arg, '--min=')) {
        $min = (float) substr($arg, strlen('--min='));
    } elseif (str_starts_with($arg, '-')) {
        fwrite(STDERR, "argument inconnu : $arg\n");
        exit(1);
    } else {
        $cloverPath = $arg;
    }
}

if ($cloverPath === null || $min === null) {
    fwrite(STDERR, "usage : php bin/coverage-gate.php <clover.xml> --min=<pourcentage>\n");
    exit(1);
}

// ⚠ Le fichier ABSENT est le cas qui coûte cher, et c'est celui qu'un `|| true` ou un
// `-f` silencieux laisserait passer : si PHPUnit est mort avant d'écrire son clover, la
// couverture n'est pas « inchangée », elle est INCONNUE.
if (! is_file($cloverPath)) {
    fwrite(STDERR, "::error::Cliquet de couverture — rapport clover absent : $cloverPath\n");
    fwrite(STDERR, "  PHPUnit ne l'a pas écrit. La couverture n'est pas « inchangée », elle est INCONNUE.\n");
    exit(1);
}

try {
    $gate = CoverageGate::fromClover((string) file_get_contents($cloverPath));
} catch (Throwable $e) {
    fwrite(STDERR, '::error::Cliquet de couverture — '.$e->getMessage()."\n");
    exit(1);
}

// Sur STDOUT et sans arrondi caché : c'est cette ligne que l'historique du job garde, et
// c'est elle qui permet de dire « le seuil n'a pas bougé, à la décimale ».
echo $gate->summary()."\n";
echo sprintf("Seuil (cliquet TCK-302) : %s %%\n", number_format($min, 1, '.', ''));

if (! $gate->passes($min)) {
    fwrite(STDERR, sprintf(
        "::error::Couverture sous le cliquet : %s %% < %s %%.\n",
        $gate->formatted(),
        number_format($min, 1, '.', ''),
    ));
    fwrite(STDERR, "  Le seuil ne se desserre PAS pour faire passer : on re-mesure, et on\n".
        "  repose le seuil sur la nouvelle valeur avec sa date, ou on écrit les tests\n".
        "  manquants. Le rapport HTML détaillé est publié en artefact sur les builds rouges.\n");
    exit(1);
}

echo "✓ cliquet tenu.\n";
