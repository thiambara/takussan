<?php

namespace Tests\Unit\Lang;

use App\Domain\Notifications\NotificationCode;
use App\Exceptions\HttpErrorCode;
use PhpToken;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-588 (ADR-0032) — l'API rend ses textes dans la langue du destinataire : il faut donc qu'ils
 * EXISTENT dans les trois. Une clé absente en `wo` ne lève rien — elle sort dans la langue de
 * repli, au milieu d'une interface wolof ; un placeholder perdu rend un message à trou.
 *
 * Trois gardes :
 *   - les mêmes fichiers de groupe, les mêmes clés et les mêmes placeholders en fr, en et wo — à une
 *     exception nommée : `en/validation.php`, qui ne porte que les surcharges du dictionnaire du
 *     framework ({@see ValidationTranslationParityTest} garde fr et wo) ;
 *   - chaque `NotificationCode` a `title`, `body` et `sms` dans les trois langues, sans placeholder
 *     étranger à ses paramètres ;
 *   - chaque code passé en littéral à `abort_code*()` ou `new ApiError(` existe dans `errors.php` ×3.
 */
class LangGroupParityTest extends TestCase
{
    private const LOCALES = ['fr', 'en', 'wo'];

    private const REFERENCE = 'fr';

    /** @var array<string, list<string>> fichier => langues où il n'est pas comparé, et pourquoi */
    private const EXCEPTIONS = [
        // Surcharges seules : l'anglais du framework est la référence (ValidationTranslationParityTest).
        'validation.php' => ['en'],
    ];

    private function root(string $path = ''): string
    {
        return dirname(__DIR__, 3).'/'.$path;
    }

    /** @return array<string, string> */
    private function group(string $locale, string $file): array
    {
        return $this->flatten(require $this->root("lang/{$locale}/{$file}"));
    }

    /**
     * @param  array<mixed>  $array
     * @return array<string, string>
     */
    private function flatten(array $array, string $prefix = ''): array
    {
        $out = [];
        foreach ($array as $key => $value) {
            if (is_array($value)) {
                $out += $this->flatten($value, "{$prefix}{$key}.");
            } else {
                $out["{$prefix}{$key}"] = (string) $value;
            }
        }

        return $out;
    }

    /** @return list<string> */
    private function placeholders(string $text): array
    {
        preg_match_all('/(?<![\w:]):([a-zA-Z_][a-zA-Z0-9_]*)/', $text, $matches);
        $found = array_values(array_unique($matches[1]));
        sort($found);

        return $found;
    }

    /** @return list<string> */
    private function files(string $locale): array
    {
        return array_map('basename', glob($this->root("lang/{$locale}/*.php")) ?: []);
    }

    public function test_les_trois_langues_ont_les_memes_fichiers_de_groupe(): void
    {
        $reference = $this->files(self::REFERENCE);
        $this->assertGreaterThan(10, count($reference), 'La référence est vide : la garde ne regarderait rien.');

        foreach (self::LOCALES as $locale) {
            $this->assertSame($reference, $this->files($locale), "lang/{$locale} n'a pas les fichiers de lang/fr");
        }
    }

    public function test_les_trois_langues_ont_les_memes_cles_et_les_memes_placeholders(): void
    {
        $gaps = [];
        $compared = 0;
        foreach ($this->files(self::REFERENCE) as $file) {
            $reference = $this->group(self::REFERENCE, $file);
            foreach (self::LOCALES as $locale) {
                if ($locale === self::REFERENCE || in_array($locale, self::EXCEPTIONS[$file] ?? [], true)) {
                    continue;
                }
                $translated = $this->group($locale, $file);
                foreach (array_keys(array_diff_key($reference, $translated)) as $key) {
                    $gaps[] = "{$locale}/{$file} : clé absente {$key}";
                }
                foreach (array_keys(array_diff_key($translated, $reference)) as $key) {
                    $gaps[] = "{$locale}/{$file} : clé en trop {$key}";
                }
                foreach (array_intersect_key($reference, $translated) as $key => $text) {
                    $compared++;
                    if ($this->placeholders($text) !== $this->placeholders($translated[$key])) {
                        $gaps[] = "{$locale}/{$file} {$key} : placeholders ".implode(',', $this->placeholders($text)).' ≠ '.implode(',', $this->placeholders($translated[$key]));
                    }
                }
            }
        }

        $this->assertGreaterThan(1000, $compared, 'Presque rien comparé : la garde ne regarderait rien.');
        $this->assertSame([], $gaps, implode("\n", $gaps));
    }

    public function test_chaque_code_de_notification_a_titre_corps_et_sms_dans_les_trois_langues(): void
    {
        $this->assertNotEmpty(NotificationCode::cases());
        $gaps = [];
        foreach (self::LOCALES as $locale) {
            $texts = $this->group($locale, 'notifications.php');
            foreach (NotificationCode::cases() as $code) {
                $allowed = array_keys($code->params() + $code->optionalParams());
                foreach (['title', 'body', 'sms'] as $surface) {
                    $key = "codes.{$code->value}.{$surface}";
                    if (! isset($texts[$key])) {
                        $gaps[] = "{$locale} : {$key} absente";

                        continue;
                    }
                    $foreign = array_diff($this->placeholders($texts[$key]), $allowed);
                    if ($foreign !== []) {
                        $gaps[] = "{$locale} : {$key} porte ".implode(',', $foreign).', hors des paramètres du code';
                    }
                }
            }
        }

        $this->assertSame([], $gaps, implode("\n", $gaps));
    }

    public function test_chaque_code_d_erreur_litteral_existe_dans_les_trois_langues(): void
    {
        $codes = $this->literalErrorCodes();
        foreach (HttpErrorCode::NAMES as $name) {
            $codes['http.'.$name] = 'HttpErrorCode';
        }
        $codes['http.server_error'] = 'HttpErrorCode';
        $codes['http.client_error'] = 'HttpErrorCode';

        $this->assertGreaterThan(100, count($codes), 'Presque aucun code lu : la garde ne regarderait rien.');
        $gaps = [];
        foreach (self::LOCALES as $locale) {
            $errors = $this->group($locale, 'errors.php');
            foreach ($codes as $code => $where) {
                if (! isset($errors[$code])) {
                    $gaps[] = "{$locale}/errors.php : {$code} absent ({$where})";
                }
            }
        }

        $this->assertSame([], $gaps, implode("\n", $gaps));
    }

    /**
     * Les codes passés EN LITTÉRAL : `abort_code(statut, 'code')`, `abort_code_if(cond, statut,
     * 'code')`, `abort_code_unless(…)`, `new ApiError(statut, 'code')` — ou par une constante de la
     * classe (`self::CODE_LOCKED`), résolue dans le fichier qui la déclare.
     *
     * @return array<string, string> code => fichier:ligne
     */
    private function literalErrorCodes(): array
    {
        $positions = ['abort_code' => 1, 'abort_code_if' => 2, 'abort_code_unless' => 2, 'ApiError' => 1];
        $codes = [];
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($this->root('app'), RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }
            $source = (string) file_get_contents($file->getPathname());
            $tokens = array_values(array_filter(
                PhpToken::tokenize($source),
                fn (PhpToken $t) => ! $t->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT]),
            ));
            preg_match_all("/const\\s+(\\w+)\\s*=\\s*'([^']+)'/", $source, $declared);
            $constants = array_combine($declared[1], $declared[2]);
            foreach ($tokens as $i => $token) {
                $name = ltrim($token->text, '\\');
                if (! isset($positions[$name]) || ($tokens[$i + 1]->text ?? null) !== '(') {
                    continue;
                }
                if ($name === 'ApiError' && ($tokens[$i - 1]->text ?? null) !== 'new') {
                    continue;
                }
                if ($name !== 'ApiError' && in_array($tokens[$i - 1]->text ?? null, ['function', '->', '::'], true)) {
                    continue;
                }
                $argument = $this->argument($tokens, $i + 1, $positions[$name]);
                $where = basename($file->getPathname()).':'.$token->line;
                if (count($argument) === 1 && $argument[0]->is(T_CONSTANT_ENCAPSED_STRING)) {
                    $codes[trim($argument[0]->text, '\'"')] = $where;
                } elseif (count($argument) === 3 && in_array($argument[0]->text, ['self', 'static'], true) && isset($constants[$argument[2]->text])) {
                    $codes[$constants[$argument[2]->text]] = $where;
                }
            }
        }

        return $codes;
    }

    /**
     * Les jetons de l'argument n° `$index` (base 0).
     *
     * @param  list<PhpToken>  $tokens
     * @return list<PhpToken>
     */
    private function argument(array $tokens, int $open, int $index): array
    {
        $depth = 0;
        $current = 0;
        $start = $open + 1;
        for ($i = $open; $i < count($tokens); $i++) {
            $text = $tokens[$i]->text;
            if (in_array($text, ['(', '[', '{'], true) || $tokens[$i]->is([T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES])) {
                $depth++;
            } elseif (in_array($text, [')', ']', '}'], true)) {
                $depth--;
                if ($depth === 0) {
                    return $current === $index ? array_slice($tokens, $start, $i - $start) : [];
                }
            } elseif ($text === ',' && $depth === 1) {
                if ($current === $index) {
                    return array_slice($tokens, $start, $i - $start);
                }
                $current++;
                $start = $i + 1;
            }
        }

        return [];
    }
}
