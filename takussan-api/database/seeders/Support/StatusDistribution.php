<?php

namespace Database\Seeders\Support;

use InvalidArgumentException;

/**
 * Weighted random picker used to distribute statuses realistically across a
 * population — e.g. "70% active, 20% terminated, 7% expired, 3% draft".
 */
class StatusDistribution
{
    /**
     * Pick a key from an associative array of weights.
     *
     * @param  array<string, int|float>  $weights
     */
    public static function pick(array $weights): string
    {
        if ($weights === []) {
            throw new InvalidArgumentException('Weights array cannot be empty.');
        }

        $total = array_sum($weights);
        if ($total <= 0) {
            throw new InvalidArgumentException('Sum of weights must be positive.');
        }

        $roll = mt_rand(1, (int) ($total * 1000)) / 1000;
        $cumulative = 0.0;

        foreach ($weights as $key => $weight) {
            $cumulative += $weight;
            if ($roll <= $cumulative) {
                return (string) $key;
            }
        }

        // Fallback: return the last key (shouldn't happen with valid input).
        return (string) array_key_last($weights);
    }

    /**
     * Split a total count across keys proportional to weights.
     *
     * @param  array<string, int|float>  $weights
     * @return array<string, int>
     */
    public static function split(int $total, array $weights): array
    {
        $sum = array_sum($weights);
        $out = [];
        $remaining = $total;
        $keys = array_keys($weights);
        foreach ($keys as $i => $key) {
            if ($i === count($keys) - 1) {
                $out[$key] = max(0, $remaining);
            } else {
                $count = (int) floor($total * $weights[$key] / $sum);
                $out[$key] = $count;
                $remaining -= $count;
            }
        }

        return $out;
    }
}
