<?php

namespace Tests\Unit\Support;

use App\Support\Http\SafeOutboundUrl;
use App\Support\Ical\IcalReader;
use App\Support\Ical\IcalWriter;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-596 (ADR-0041 §2, §7) — le lecteur et l'écrivain iCal maison, et le jugement d'une adresse
 * par la garde SSRF.
 */
class IcalTest extends TestCase
{
    public function test_the_reader_unfolds_lines_and_reads_all_day_and_date_time_events(): void
    {
        $ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc-\r\n 123@airbnb\r\nDTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261113\r\nEND:VEVENT\r\n"
            ."BEGIN:VEVENT\r\nUID:t@booking\r\nDTSTART;TZID=Africa/Dakar:20261120T150000\r\nDTEND;TZID=Africa/Dakar:20261122T110000\r\nEND:VEVENT\r\n"
            ."BEGIN:VEVENT\r\nUID:midnight\r\nDTSTART:20261201T000000Z\r\nDTEND:20261203T000000Z\r\nEND:VEVENT\r\n"
            ."BEGIN:VEVENT\r\nUID:noend\r\nDTSTART;VALUE=DATE:20261224\r\nEND:VEVENT\r\n"
            ."BEGIN:VEVENT\r\nUID:gone\r\nSTATUS:CANCELLED\r\nDTSTART;VALUE=DATE:20261210\r\nDTEND;VALUE=DATE:20261211\r\nEND:VEVENT\r\n"
            ."BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261210\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

        $events = array_map(
            static fn (array $e): array => [$e['uid'], $e['start']->format('Ymd'), $e['end']->format('Ymd')],
            (new IcalReader)->events($ics),
        );

        $this->assertSame([
            ['abc-123@airbnb', '20261110', '20261113'],
            // Une fin à 11 h couvre ce jour-là.
            ['t@booking', '20261120', '20261123'],
            // Une fin à minuit ne le couvre pas.
            ['midnight', '20261201', '20261203'],
            ['noend', '20261224', '20261225'],
        ], $events);
    }

    public function test_the_writer_emits_all_day_events_with_an_exclusive_end_and_escapes_text(): void
    {
        $out = (new IcalWriter)->write([[
            'uid' => 'booking-1@takussan',
            'start' => CarbonImmutable::create(2026, 11, 10),
            'end' => CarbonImmutable::create(2026, 11, 13),
            'summary' => 'Réservé; ok, \\ fin',
        ]], 'Takussan');

        $this->assertStringStartsWith("BEGIN:VCALENDAR\r\n", $out);
        $this->assertStringContainsString("DTSTART;VALUE=DATE:20261110\r\n", $out);
        $this->assertStringContainsString("DTEND;VALUE=DATE:20261113\r\n", $out);
        $this->assertStringContainsString('SUMMARY:Réservé\; ok\\, \\\\ fin', $out);

        // Ce qu'il écrit, le lecteur le relit à l'identique.
        $back = (new IcalReader)->events($out);
        $this->assertSame('20261113', $back[0]['end']->format('Ymd'));
    }

    /** @return array<string, array{0: string, 1: bool}> */
    public static function addresses(): array
    {
        return [
            'bouclage' => ['127.0.0.1', false],
            'métadonnées' => ['169.254.169.254', false],
            '10/8' => ['10.20.30.40', false],
            '172.16/12' => ['172.20.0.1', false],
            '192.168/16' => ['192.168.0.1', false],
            'CGNAT' => ['100.64.0.1', false],
            'non spécifiée' => ['0.0.0.0', false],
            'banc d\'essai' => ['198.18.0.1', false],
            'multidiffusion' => ['224.0.0.1', false],
            'IPv6 bouclage' => ['::1', false],
            'IPv6 lien-local' => ['fe80::1', false],
            'IPv6 ULA' => ['fc00::1', false],
            'IPv6 multidiffusion' => ['ff02::1', false],
            'IPv4 mappée' => ['::ffff:127.0.0.1', false],
            'IPv4 mappée hexadécimale' => ['::ffff:a9fe:a9fe', false],
            'NAT64 vers les métadonnées' => ['64:ff9b::a9fe:a9fe', false],
            'NAT64 local' => ['64:ff9b:1::a9fe:a9fe', false],
            '6to4' => ['2002:a9fe:a9fe::1', false],
            'pas une adresse' => ['localhost', false],
            'publique v4' => ['93.184.216.34', true],
            'publique v6' => ['2606:4700::1111', true],
        ];
    }

    #[DataProvider('addresses')]
    public function test_only_global_addresses_are_public(string $ip, bool $public): void
    {
        $this->assertSame($public, SafeOutboundUrl::isPublicIp($ip));
    }
}
