<?php

namespace App\Support\Ical;

use Carbon\CarbonImmutable;

/**
 * TCK-596 (ADR-0041 §2) — lit les `VEVENT` d'un calendrier iCal (RFC 5545) en plages de JOURS
 * `[start, end)`.
 *
 * Ce qu'il comprend, et rien de plus : le dépliage des lignes (§3.1), `UID`, `DTSTART`, `DTEND`
 * (date ou date-heure, avec ou sans `TZID`), `DURATION` absente, `STATUS:CANCELLED` (ignoré). Une
 * date-heure est ramenée à son jour ; une fin à une heure non nulle couvre ce jour-là (une nuit
 * commencée est prise). Sans `DTEND`, l'événement couvre son jour de début. `RRULE` n'est pas
 * dépliée : un événement récurrent est lu comme sa première occurrence (ADR-0041, Conséquences).
 */
class IcalReader
{
    /**
     * @return list<array{uid: string, start: CarbonImmutable, end: CarbonImmutable}>
     */
    public function events(string $ics): array
    {
        $events = [];
        $current = null;

        foreach ($this->unfold($ics) as $line) {
            $upper = strtoupper($line);
            if ($upper === 'BEGIN:VEVENT') {
                $current = [];

                continue;
            }
            if ($upper === 'END:VEVENT') {
                $event = $current !== null ? $this->toEvent($current) : null;
                if ($event !== null) {
                    $events[] = $event;
                }
                $current = null;

                continue;
            }
            if ($current === null || ! str_contains($line, ':')) {
                continue;
            }

            [$head, $value] = explode(':', $line, 2);
            $name = strtoupper(explode(';', $head, 2)[0]);
            if (in_array($name, ['UID', 'DTSTART', 'DTEND', 'STATUS'], true) && ! isset($current[$name])) {
                $current[$name] = trim($value);
            }
        }

        return $events;
    }

    /** @return list<string> */
    private function unfold(string $ics): array
    {
        $ics = str_replace(["\r\n", "\r"], "\n", $ics);
        $ics = preg_replace("/\n[ \t]/", '', $ics) ?? '';

        return array_values(array_filter(array_map('rtrim', explode("\n", $ics)), static fn (string $l): bool => $l !== ''));
    }

    /**
     * @param  array<string, string>  $props
     * @return array{uid: string, start: CarbonImmutable, end: CarbonImmutable}|null
     */
    private function toEvent(array $props): ?array
    {
        if (! isset($props['UID'], $props['DTSTART']) || $props['UID'] === '') {
            return null;
        }
        if (strtoupper($props['STATUS'] ?? '') === 'CANCELLED') {
            return null;
        }

        $start = $this->day($props['DTSTART'], roundUp: false);
        if ($start === null) {
            return null;
        }
        $end = isset($props['DTEND']) ? $this->day($props['DTEND'], roundUp: true) : null;
        if ($end === null || $end->lte($start)) {
            $end = $start->addDay();
        }

        return ['uid' => mb_substr($props['UID'], 0, 255), 'start' => $start, 'end' => $end];
    }

    private function day(string $value, bool $roundUp): ?CarbonImmutable
    {
        if (preg_match('/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/', $value, $m) !== 1) {
            return null;
        }
        if (! checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return null;
        }

        $day = CarbonImmutable::create((int) $m[1], (int) $m[2], (int) $m[3]);
        $hasTime = isset($m[4]) && ($m[4].$m[5].$m[6]) !== '000000';

        return $roundUp && $hasTime ? $day->addDay() : $day;
    }
}
