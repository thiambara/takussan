<?php

namespace Tests\Support;

use RuntimeException;
use SimpleXMLElement;
use Throwable;

/**
 * Le cliquet de couverture, calculé DEPUIS LE CLOVER (TCK-331).
 *
 * ─── POURQUOI IL NE VIT PLUS DANS `artisan test --min=` ─────────────────────────────
 *
 * `--min` de Collision n'est évalué que si Collision a pu relire SON PROPRE rapport
 * `--coverage-php`, qu'il passe à PHPUnit dans le dos de l'appelant
 * (`TestCommand::commonArguments()`). Passer la même option en ligne de commande la rend
 * présente deux fois, PHPUnit l'écarte avec un `WARN` et sort en 1 — sur une suite
 * entièrement verte, sans imprimer un chiffre. Mesuré, cf. le corps de TCK-331.
 *
 * Le clover, lui, est écrit par PHPUnit et par personne d'autre. Il est déjà produit, déjà
 * publié en artefact, et il porte exactement le couple de nombres que Collision affichait.
 *
 * ─── CE QUE CETTE CLASSE GARDE, ET QUE `--min` NE GARDAIT PAS ───────────────────────
 *
 * **Une mesure absente est un ÉCHEC.** `0 / 0` n'est pas 100 % : c'est « le pilote de
 * couverture n'a rien collecté ». Un cliquet qui laisse passer ce cas-là ne cliquette plus
 * du jour où PCOV disparaît du runner — et personne ne le voit, puisque tout est vert.
 *
 * ─── LE NOMBRE EST LE MÊME, ET C'EST TESTÉ ──────────────────────────────────────────
 *
 * Collision affiche `percentageOfExecutedLines()` du rapport, c'est-à-dire
 * lignes exécutées / lignes exécutables. Le `<metrics>` de PROJET du clover porte ce même
 * couple sous les noms `coveredstatements` / `statements` — vérifié par mesure appariée
 * sur un même run (`Total: 0.8 %` de Collision ↔ 202/24974 du clover).
 */
final class CoverageGate
{
    private function __construct(
        public readonly int $executedLines,
        public readonly int $executableLines,
    ) {}

    /**
     * @throws RuntimeException si le rapport est vide, illisible, sans métriques de
     *                          projet, ou s'il n'a mesuré aucune ligne exécutable.
     */
    public static function fromClover(string $xml): self
    {
        if (trim($xml) === '') {
            throw new RuntimeException(
                'rapport clover vide — PHPUnit ne l\'a pas écrit, ou il a été tronqué à zéro octet.'
            );
        }

        // `libxml_use_internal_errors` : sans lui, un XML tronqué émet un warning PHP et
        // rend `false`, ce qui se lirait comme « pas de données » là où il faut LEVER.
        $previous = libxml_use_internal_errors(true);

        try {
            $document = new SimpleXMLElement($xml);
        } catch (Throwable $e) {
            throw new RuntimeException('rapport clover illisible : '.$e->getMessage());
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        $metrics = $document->xpath('/coverage/project/metrics');

        if (! is_array($metrics) || $metrics === []) {
            throw new RuntimeException(
                'rapport clover sans `<project><metrics>` — ce n\'est pas un clover de PHPUnit.'
            );
        }

        $executable = (int) ((string) $metrics[0]['statements']);
        $executed = (int) ((string) $metrics[0]['coveredstatements']);

        if ($executable <= 0) {
            throw new RuntimeException(
                'le rapport ne compte aucune ligne exécutable — aucune couverture n\'a été '
                ."collectée.\n".
                "  Ce n'est PAS 100 % : c'est une mesure absente. Pilote de couverture manquant\n".
                '  (PCOV en CI, `XDEBUG_MODE=coverage` en local) ou `<source>` de phpunit.xml vide ?'
            );
        }

        return new self($executed, $executable);
    }

    public function percentage(): float
    {
        return $this->executedLines / $this->executableLines * 100;
    }

    /** Le même arrondi que Collision — une décimale, point décimal. */
    public function formatted(): string
    {
        return number_format($this->percentage(), 1, '.', '');
    }

    /**
     * La comparaison porte sur le flottant BRUT, comme Collision : afficher 86,2 et
     * comparer 86,2 laisserait passer une couverture réelle de 86,15 sous un seuil de 86,2.
     */
    public function passes(float $min): bool
    {
        return $this->percentage() >= $min;
    }

    /**
     * La ligne que la CI imprime. Elle porte `Total:` délibérément : c'est le mot que
     * cherche l'œil dans un journal de build, et son ABSENCE est désormais le signal
     * qu'un step est cassé plutôt que silencieux.
     */
    public function summary(): string
    {
        return sprintf(
            'Total: %s %% (%d / %d lignes exécutables)',
            $this->formatted(),
            $this->executedLines,
            $this->executableLines,
        );
    }
}
