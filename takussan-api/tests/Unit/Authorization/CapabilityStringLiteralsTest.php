<?php

namespace Tests\Unit\Authorization;

use App\Models\Enums\Capability;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

/**
 * TCK-297 — garde contre la capacité fantôme.
 *
 * `$user->can('leases.terminate')` résout par une Gate dérivée de l'enum
 * `Capability` (`AppServiceProvider`). Si la chaîne n'est pas un cas de l'enum,
 * **aucune Gate n'est définie — et une ability non définie ne lève pas, elle
 * refuse**. Une faute de frappe ne produit donc pas une erreur mais un retrait
 * d'accès silencieux, invisible sur une suite verte.
 *
 * Ce défaut a déjà coûté deux fois : `MediaPolicy::viewRaw` avec
 * `can('properties.update')` (trouvé par TCK-278), puis `BasePolicy` avec ses
 * cinq abilities concaténées (trouvé par TCK-297). Aucun type, aucun lint,
 * aucun test ne pouvait les attraper — celui-ci les attrape.
 *
 * ⚠ **Le tokenizer n'est pas une coquetterie.** Un `grep` sur cette même
 * recherche rend trois occurrences de `'properties.update'` dans le dépôt :
 * un docblock, un commentaire de test, et un nom de route Laravel. Les trois
 * sont inoffensives, et une garde qui les signale serait désactivée dans la
 * semaine. `token_get_all()` ne voit que le code exécuté.
 */
class CapabilityStringLiteralsTest extends TestCase
{
    /**
     * Fonctions dont le premier argument est une ability.
     *
     * @var list<string>
     */
    private const AUTHORIZATION_CALLS = [
        'can', 'cannot', 'canAny', 'authorize', 'allows', 'denies', 'check',
    ];

    /**
     * Forme d'une capacité : `<domaine>.<verbe>`. Les abilities de policy
     * (`view`, `duplicate`, `refundDeposit`) n'ont pas de point et sont donc
     * hors périmètre — ce sont des noms de méthode, pas des capacités.
     */
    private const CAPABILITY_SHAPE = '/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/';

    public function test_every_capability_literal_in_app_is_a_real_enum_case(): void
    {
        $offenders = [];

        foreach ($this->phpFilesUnder(dirname(__DIR__, 3).'/app') as $file) {
            foreach ($this->capabilityLiteralsIn($file) as [$literal, $line]) {
                if (Capability::tryFrom($literal) === null) {
                    $relative = str_replace(dirname(__DIR__, 3).'/', '', $file);
                    $offenders[] = "{$relative}:{$line} → '{$literal}'";
                }
            }
        }

        $this->assertSame(
            [],
            $offenders,
            "Ces chaînes ont la forme d'une capacité mais n'existent pas dans "
            ."App\\Models\\Enums\\Capability. Aucune Gate n'est définie pour elles : "
            ."elles REFUSENT en silence au lieu de lever.\n  ".implode("\n  ", $offenders),
        );
    }

    /**
     * La garde ne vaut que si elle voit quelque chose. Sans ce test, une
     * régression du tokenizer la rendrait verte sur un ensemble vide — et
     * verte pour la mauvaise raison.
     */
    public function test_the_scanner_actually_finds_capability_literals(): void
    {
        $found = [];

        foreach ($this->phpFilesUnder(dirname(__DIR__, 3).'/app/Policies') as $file) {
            foreach ($this->capabilityLiteralsIn($file) as [$literal]) {
                $found[] = $literal;
            }
        }

        $this->assertNotEmpty(
            $found,
            'le scanner ne trouve plus aucune capacité littérale dans app/Policies — '
            .'il est cassé, pas le code',
        );

        $this->assertContains('leases.terminate', $found);
    }

    /**
     * Et il ne doit PAS voir les commentaires — la fausse alerte qui a motivé
     * le tokenizer. `MediaPolicy` contient `can('properties.update')` dans un
     * docblock ; cette chaîne n'est aucun cas de l'enum, et la garde reste
     * verte parce qu'elle n'est pas du code.
     */
    public function test_the_scanner_ignores_comments_and_docblocks(): void
    {
        $mediaPolicy = dirname(__DIR__, 3).'/app/Policies/MediaPolicy.php';

        $this->assertStringContainsString(
            "can('properties.update')",
            (string) file_get_contents($mediaPolicy),
            'le docblock témoin a disparu — ce test ne prouve plus rien',
        );

        $literals = array_column($this->capabilityLiteralsIn($mediaPolicy), 0);

        $this->assertNotContains('properties.update', $literals);
    }

    /**
     * @return list<string>
     */
    private function phpFilesUnder(string $directory): array
    {
        $files = [];

        /** @var SplFileInfo $file */
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory)) as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }

        sort($files);

        return $files;
    }

    /**
     * Extrait les littéraux de forme capacité passés en premier argument d'un
     * appel d'autorisation. Ne regarde que des tokens de code : les
     * `T_COMMENT` et `T_DOC_COMMENT` ne sont jamais inspectés.
     *
     * @return list<array{0: string, 1: int}>
     */
    private function capabilityLiteralsIn(string $file): array
    {
        $tokens = token_get_all((string) file_get_contents($file));
        $found = [];
        $count = count($tokens);

        for ($i = 0; $i < $count; $i++) {
            $token = $tokens[$i];

            if (! is_array($token) || $token[0] !== T_STRING) {
                continue;
            }

            if (! in_array($token[1], self::AUTHORIZATION_CALLS, true)) {
                continue;
            }

            $next = $this->nextMeaningful($tokens, $i + 1);
            if ($next === null || $tokens[$next] !== '(') {
                continue;
            }

            $argument = $this->nextMeaningful($tokens, $next + 1);
            if ($argument === null || ! is_array($tokens[$argument])
                || $tokens[$argument][0] !== T_CONSTANT_ENCAPSED_STRING) {
                continue;
            }

            $literal = trim($tokens[$argument][1], "'\"");

            if (preg_match(self::CAPABILITY_SHAPE, $literal) === 1) {
                $found[] = [$literal, $tokens[$argument][2]];
            }
        }

        return $found;
    }

    /**
     * @param  array<int, array{0: int, 1: string, 2: int}|string>  $tokens
     */
    private function nextMeaningful(array $tokens, int $from): ?int
    {
        $count = count($tokens);

        for ($i = $from; $i < $count; $i++) {
            if (is_array($tokens[$i])
                && in_array($tokens[$i][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }

            return $i;
        }

        return null;
    }
}
