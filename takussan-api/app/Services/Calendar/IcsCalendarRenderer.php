<?php

namespace App\Services\Calendar;

use Illuminate\Support\Carbon;

/**
 * TCK-591 (ADR-0034) — rend des événements d'agenda en iCalendar (RFC 5545).
 *
 * Ce qui sort : un `UID` stable par événement, l'horaire, un résumé « type — bien », le statut, un
 * lien vers la console et, pour une visite servie au personnel, son lieu (`LOCATION`, TCK-2585). Ce
 * qui ne sort jamais : nom, téléphone ou e-mail d'un tiers (visiteur, locataire, client,
 * prestataire) — le collecteur sert `visitor_name` à la console du personnel (TCK-2585), ce rendu
 * ne l'écrit pas.
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
            $summary = __('calendar.feed.summary.'.$type.$kind, [
                // TCK-2502 — une visite dont l'heure n'est pas fixée : le titre du bien et la tranche,
                // rendus dans la langue du flux (`visit_window`) ; le titre de la console est déjà composé.
                'title' => (string) ($event['property_title'] ?? $event['title'] ?? ''),
                'window' => isset($event['preferred_window']) ? __('visits.windows.'.$event['preferred_window'], [], $locale) : '',
            ], $locale);

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
            // TCK-2585 — le lieu d'une visite, quand le collecteur l'a servi (personnel de l'agence
            // du bien) : la rue et le quartier. Le nom du visiteur, servi à côté, ne sort pas ici.
            $location = implode(', ', array_filter([
                isset($event['address_line']) ? trim((string) $event['address_line']) : '',
                isset($event['neighborhood']) ? trim((string) $event['neighborhood']) : '',
            ], fn (string $part) => $part !== ''));
            if ($location !== '') {
                $lines[] = 'LOCATION:'.$this->escape($location);
            }
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
