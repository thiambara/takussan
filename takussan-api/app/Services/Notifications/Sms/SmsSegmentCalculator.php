<?php

namespace App\Services\Notifications\Sms;

/**
 * TCK-102 — Estimate the number of billed segments for a message.
 *
 * Heuristic only — providers ultimately bill from their own counter,
 * but we need a local estimate for cost tracking and for the Mtarget
 * `allowunicode=true` decision.
 *
 * GSM-7 alphabet: 160 chars / segment, 153 / segment when concatenated.
 * UCS-2 (any char outside the GSM-7 set): 70 / segment, 67 / segment
 * when concatenated.
 */
final class SmsSegmentCalculator
{
    public static function isUnicode(string $message): bool
    {
        // Any non-GSM-7 char forces UCS-2 (e.g. "é", "à", emoji).
        // Approximation: anything outside basic-latin printable range
        // OR a known non-GSM extension. Cheap and adequate.
        return (bool) preg_match('/[^\x00-\x7F]/u', $message);
    }

    public static function segmentsCount(string $message): int
    {
        $length = mb_strlen($message);
        if ($length === 0) {
            return 0;
        }
        if (self::isUnicode($message)) {
            return $length <= 70 ? 1 : (int) ceil($length / 67);
        }

        return $length <= 160 ? 1 : (int) ceil($length / 153);
    }
}
