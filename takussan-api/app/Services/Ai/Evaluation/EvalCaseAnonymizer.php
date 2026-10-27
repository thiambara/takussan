<?php

namespace App\Services\Ai\Evaluation;

use App\Support\PhoneMasker;
use Closure;

/**
 * TCK-2384 — un cas d'évaluation n'entre dans le dépôt qu'anonymisé. Les valeurs des champs
 * personnels (nom, téléphone, courriel, contact, adresse) de la proposition et de la valeur retenue
 * sont remplacées par un jeton partout où elles paraissent ; puis tout numéro sénégalais et tout
 * courriel restants. `check-ai-evals-pii.mjs` garde le résultat.
 */
final class EvalCaseAnonymizer
{
    public const NAME_TOKEN = '[NOM]';

    public const EMAIL_TOKEN = '[EMAIL]';

    private const PERSONAL_KEY = '/(^|_)(nom|name|prenom|phone|telephone|tel|email|mail|contact|adresse|address)(_|$)/i';

    private const EMAIL = '/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/';

    /**
     * @param  array<string, mixed>  $expected
     * @param  array<string, mixed>  $proposal
     * @return array{input: string, expected: array<string, mixed>}
     */
    public function anonymize(string $input, array $expected, array $proposal = []): array
    {
        $replacements = $this->personalValues($proposal) + $this->personalValues($expected);
        uksort($replacements, fn (string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));
        $clean = fn (string $text): string => (string) preg_replace(
            self::EMAIL,
            self::EMAIL_TOKEN,
            PhoneMasker::mask(str_ireplace(array_keys($replacements), array_values($replacements), $text)),
        );

        return ['input' => $clean($input), 'expected' => $this->walk($expected, $clean)];
    }

    /**
     * @param  array<string, mixed>  $values
     * @return array<string, string> valeur personnelle → jeton
     */
    private function personalValues(array $values): array
    {
        $found = [];
        array_walk_recursive($values, function (mixed $value, int|string $key) use (&$found): void {
            if (is_string($key) && is_string($value) && trim($value) !== '' && preg_match(self::PERSONAL_KEY, $key) === 1) {
                $found[trim($value)] = $this->tokenFor($key);
            }
        });

        return $found;
    }

    private function tokenFor(string $key): string
    {
        return match (true) {
            preg_match('/(phone|telephone|tel)/i', $key) === 1 => PhoneMasker::TOKEN,
            preg_match('/(email|mail)/i', $key) === 1 => self::EMAIL_TOKEN,
            default => self::NAME_TOKEN,
        };
    }

    /**
     * @param  array<int|string, mixed>  $values
     * @return array<int|string, mixed>
     */
    private function walk(array $values, Closure $clean): array
    {
        foreach ($values as $key => $value) {
            $values[$key] = match (true) {
                is_array($value) => $this->walk($value, $clean),
                is_string($value) && is_string($key) && preg_match(self::PERSONAL_KEY, $key) === 1 => $this->tokenFor($key),
                is_string($value) => $clean($value),
                default => $value,
            };
        }

        return $values;
    }
}
