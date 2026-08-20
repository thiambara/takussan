<?php

namespace Tests\Unit\Testing;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use Tests\Support\CoverageGate;

/**
 * Le cliquet de couverture, lu DEPUIS LE CLOVER (TCK-331).
 *
 * Il vivait dans `artisan test --coverage --min=` — c'est-à-dire dans un code qui ne
 * s'exécute QUE si Collision a pu relire son propre rapport `--coverage-php`. Le jour où
 * cette option a été passée une seconde fois en ligne de commande, PHPUnit l'a écartée,
 * le rapport ne s'est jamais matérialisé, `--min` n'a rien eu à évaluer, et le step est
 * sorti en **1 sans imprimer un seul chiffre**. La CI a rougi deux fois de suite sur une
 * suite entièrement verte dont la couverture était, mesurée sur le clover, à 86,33 %.
 *
 * Ces tests gardent les trois propriétés qui font la différence entre un cliquet et une
 * décoration :
 *
 * 1. **Le nombre est celui de Collision, à la décimale** — sinon « le seuil n'a pas
 *    bougé » serait invérifiable.
 * 2. **Une mesure ABSENTE est un échec, jamais un succès.** `0 / 0` vaut « on n'a rien
 *    mesuré », pas « 100 % ». C'est le seul endroit où un cliquet peut mentir dans le
 *    sens qui coûte cher.
 * 3. **Chaque refus porte sa raison dans son message.** Une sortie 1 muette est ce qui a
 *    coûté une journée ici.
 *
 * `PHPUnit\Framework\TestCase` et non `Tests\TestCase` : aucune application Laravel n'est
 * nécessaire (cf. `ImpactMapTest`).
 */
class CoverageGateTest extends TestCase
{
    private function clover(string $statements, string $covered): string
    {
        return <<<XML
        <?xml version="1.0" encoding="UTF-8"?>
        <coverage generated="1787227739">
          <project timestamp="1787227739" name="Clover Coverage">
            <package name="App\Models">
              <file name="/dépôt/takussan-api/app/Models/Property.php">
                <metrics complexity="2" methods="1" coveredmethods="1" conditionals="0" coveredconditionals="0" statements="3" coveredstatements="2" elements="4" coveredelements="3"/>
              </file>
            </package>
            <metrics files="931" loc="71243" ncloc="58629" classes="849" methods="3058" coveredmethods="20" conditionals="0" coveredconditionals="0" statements="{$statements}" coveredstatements="{$covered}" elements="28032" coveredelements="222"/>
          </project>
        </coverage>
        XML;
    }

    public function test_it_reads_the_project_metrics_and_not_the_per_file_ones(): void
    {
        // Le `<metrics>` de fichier dirait 2/3 = 66,7 % ; celui du projet dit 202/24974.
        $gate = CoverageGate::fromClover($this->clover('24974', '202'));

        $this->assertSame(24974, $gate->executableLines);
        $this->assertSame(202, $gate->executedLines);
        $this->assertSame('0.8', $gate->formatted());
    }

    /**
     * La mesure de référence du dépôt (CLAUDE.md, 2026-08-16) : 21 148 / 24 544 = 86,16 %.
     * Le seuil se compare sur le flottant BRUT, exactement comme Collision
     * (`(int) ($coverage < $this->option('min'))`), et jamais sur l'arrondi affiché.
     */
    public function test_it_matches_the_reference_measurement_and_ratchets_on_the_raw_float(): void
    {
        $gate = CoverageGate::fromClover($this->clover('24544', '21148'));

        $this->assertSame('86.2', $gate->formatted());
        $this->assertEqualsWithDelta(86.16, $gate->percentage(), 0.005);
        $this->assertTrue($gate->passes(86.0));
        $this->assertFalse($gate->passes(87.0));
    }

    /**
     * ⚠ LE CŒUR DE LA FICHE. Un rapport vide n'est pas une couverture parfaite : c'est
     * une couverture qu'on n'a pas mesurée. `0 / 0` en flottant vaut soit NAN soit 100 %
     * selon la convention retenue — les deux passeraient un `>= 86`.
     */
    public function test_a_report_that_measured_nothing_is_a_failure_not_a_pass(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/aucune ligne exécutable/');

        CoverageGate::fromClover($this->clover('0', '0'));
    }

    public function test_a_clover_without_project_metrics_is_a_failure(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/metrics/');

        CoverageGate::fromClover('<?xml version="1.0"?><coverage><project name="x"/></coverage>');
    }

    /**
     * Un clover tronqué — écrivain interrompu, disque plein — ne doit pas se lire comme
     * « 0 % » ni comme « pas de données, on laisse passer » : il doit LEVER.
     */
    public function test_a_truncated_clover_is_a_failure(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/illisible/');

        CoverageGate::fromClover('<?xml version="1.0"?><coverage><project');
    }

    public function test_an_empty_file_is_a_failure(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/vide/');

        CoverageGate::fromClover('');
    }

    /**
     * La ligne que la CI imprime. Elle porte le mot `Total:` parce que c'est ce que
     * cherche l'œil qui relit un journal de build — et parce qu'un step qui n'en imprime
     * pas doit désormais être considéré comme cassé, pas comme silencieux.
     */
    public function test_it_prints_a_total_line_shaped_like_the_one_it_replaces(): void
    {
        $gate = CoverageGate::fromClover($this->clover('24544', '21148'));

        $this->assertSame('Total: 86.2 % (21148 / 24544 lignes exécutables)', $gate->summary());
    }
}
