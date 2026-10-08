<?php

namespace App\Support\Ical;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * TCK-596 (ADR-0041 §2) — écrit un calendrier iCal (RFC 5545) d'événements JOURNÉE ENTIÈRE.
 *
 * Une seule forme : `DTSTART;VALUE=DATE` et `DTEND;VALUE=DATE` **exclusif**, le jour qui suit la
 * dernière nuit — la même convention que `bookings.end_date` et `property_unavailabilities.ends_on`,
 * recopiés tels quels.
 */
class IcalWriter
{
    /**
     * @param  iterable<array{uid: string, start: CarbonInterface|string, end: CarbonInterface|string, summary: string}>  $events
     */
    public function write(iterable $events, string $calendarName): string
    {
        $stamp = Carbon::now()->utc()->format('Ymd\THis\Z');

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Takussan//Disponibilites//FR',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:'.$this->escape($calendarName),
        ];

        foreach ($events as $event) {
            $lines[] = 'BEGIN:VEVENT';
            $lines[] = 'UID:'.$this->escape($event['uid']);
            $lines[] = 'DTSTAMP:'.$stamp;
            $lines[] = 'DTSTART;VALUE=DATE:'.Carbon::parse($event['start'])->format('Ymd');
            $lines[] = 'DTEND;VALUE=DATE:'.Carbon::parse($event['end'])->format('Ymd');
            $lines[] = 'SUMMARY:'.$this->escape($event['summary']);
            $lines[] = 'TRANSP:OPAQUE';
            $lines[] = 'END:VEVENT';
        }

        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", array_map($this->fold(...), $lines))."\r\n";
    }

    /** RFC 5545 §3.3.11 — barre oblique inverse, point-virgule, virgule et saut de ligne. */
    private function escape(string $value): string
    {
        return str_replace(
            ['\\', ';', ',', "\r\n", "\n", "\r"],
            ['\\\\', '\;', '\\,', '\\n', '\\n', '\\n'],
            $value,
        );
    }

    /** RFC 5545 §3.1 — une ligne de plus de 75 octets se replie, sans couper un caractère UTF-8. */
    private function fold(string $line): string
    {
        if (strlen($line) <= 75) {
            return $line;
        }

        $out = [];
        $current = '';
        foreach (mb_str_split($line) as $char) {
            $limit = $out === [] ? 75 : 74;
            if (strlen($current) + strlen($char) > $limit) {
                $out[] = $current;
                $current = '';
            }
            $current .= $char;
        }
        $out[] = $current;

        return implode("\r\n ", $out);
    }
}
