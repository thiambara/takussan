<?php

namespace App\Services\Calendar;

use Illuminate\Support\Carbon;

/**
 * TCK-591 (ADR-0034) — rend des événements d'agenda en iCalendar (RFC 5545).
 *
 * Ce qui sort : un `UID` stable par événement, l'horaire, un résumé « type — bien », le statut et un
 * lien vers la console. Ce qui ne sort jamais : nom, téléphone ou e-mail d'un tiers (visiteur,
 * locataire, client, prestataire) — les événements que le collecteur produit n'en portent pas, et ce
 * rendu n'en ajoute aucun.
 *
 * Le texte du résumé est rendu dans la langue du titulaire du lien : le flux est une surface de
 * rendu, comme un PDF ou un e-mail, pas une réponse d'API consommée par le front.
 */
class IcsCalendarRenderer
{
    /**
     * @param  iterable<array<string, mixed>>  $events
     */
    public function render(iterable $events, string $calendarName, string $locale): string
    {
        $stamp = Carbon::now()->utc()->format('Ymd\THis\Z');
        $front = rtrim((string) config('app.frontend_url'), '/');

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Takussan//Agenda//FR',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:'.$this->escape($calendarName),
        ];

        foreach ($events as $event) {
            $type = (string) $event['type'];
            $kind = isset($event['kind']) ? '_'.$event['kind'] : '';
            $summary = __('calendar.feed.summary.'.$type.$kind, ['title' => (string) ($event['title'] ?? '')], $locale);

            $lines[] = 'BEGIN:VEVENT';
            $lines[] = 'UID:'.$this->escape((string) ($event['key'] ?? $type.'-'.$event['id'])).'@takussan';
            $lines[] = 'DTSTAMP:'.$stamp;

            $start = Carbon::parse((string) $event['start']);
            if (! empty($event['all_day'])) {
                $end = Carbon::parse((string) ($event['end'] ?? $event['start']));
                $lines[] = 'DTSTART;VALUE=DATE:'.$start->format('Ymd');
                // DTEND exclusif : le lendemain du dernier jour.
                $lines[] = 'DTEND;VALUE=DATE:'.$end->copy()->addDay()->format('Ymd');
            } else {
                $end = isset($event['end']) ? Carbon::parse((string) $event['end']) : $start;
                if ($end->lte($start)) {
                    $end = $start->copy()->addMinutes(30);
                }
                $lines[] = 'DTSTART:'.$start->copy()->utc()->format('Ymd\THis\Z');
                $lines[] = 'DTEND:'.$end->copy()->utc()->format('Ymd\THis\Z');
            }

            $lines[] = 'SUMMARY:'.$this->escape($summary);
            if (! empty($event['resource_url'])) {
                $lines[] = 'URL:'.$this->escape($front.$event['resource_url']);
            }
            $lines[] = 'CATEGORIES:'.$this->escape(strtoupper($type));
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
            ['\\\\', '\\;', '\\,', '\\n', '\\n', '\\n'],
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
