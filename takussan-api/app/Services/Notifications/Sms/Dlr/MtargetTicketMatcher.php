<?php

namespace App\Services\Notifications\Sms\Dlr;

use App\Services\Notifications\Sms\Drivers\MtargetSmsDriver;
use App\Services\Notifications\Sms\PhoneNumber;

/**
 * TCK-294 — Turn an (operator ticket, msisdn) pair into the ordered list
 * of `notification_delivery_attempts.provider_message_id` values it can
 * match.
 *
 * Mtarget returns ONE ticket for a batched send of up to 500 recipients,
 * so {@see MtargetSmsDriver} stores `"{ticket}|{E.164}"` to keep the row unique per recipient. A
 * report therefore matches the suffixed id first, and the bare ticket
 * second (single-recipient sends, and rows written before that scheme).
 *
 * Extracted so the webhook and the pulling command cannot drift apart on
 * the one piece of matching logic they must agree on.
 */
final class MtargetTicketMatcher
{
    /**
     * @return list<string> candidate provider_message_id values, most specific first
     */
    public static function candidates(string $ticket, string $msisdn): array
    {
        $ticket = trim($ticket);
        if ($ticket === '') {
            return [];
        }

        // A ticket that already carries a `|…` suffix comes from a caller
        // that read it off our own row — keep it as the primary candidate
        // and derive the bare root as the fallback.
        $root = str_contains($ticket, '|') ? explode('|', $ticket, 2)[0] : $ticket;

        $candidates = [$ticket];
        $e164 = self::toE164($msisdn);
        if ($e164 !== null) {
            $candidates[] = $root.'|'.$e164;
        }
        $candidates[] = $root;

        return array_values(array_unique(array_filter($candidates)));
    }

    /**
     * Mtarget returns the recipient without the leading `+`
     * (`221771111111`); our rows store E.164. Returns null rather than
     * throwing when the operator sends `"null"` or an unparseable value —
     * the bare-ticket candidate still stands a chance.
     */
    private static function toE164(string $msisdn): ?string
    {
        $clean = preg_replace('/\s+/', '', trim($msisdn)) ?? '';
        if ($clean === '' || $clean === 'null') {
            return null;
        }
        if (! str_starts_with($clean, '+')) {
            $clean = '+'.$clean;
        }

        return PhoneNumber::isValid($clean) ? $clean : null;
    }
}
