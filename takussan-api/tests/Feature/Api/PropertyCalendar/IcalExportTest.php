<?php

namespace Tests\Feature\Api\PropertyCalendar;

use App\Models\Agency;
use App\Models\Enums\BookingStatus;
use App\Models\PropertyCalendarFeed;
use App\Models\PropertyUnavailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-596 §3B (AC8, ADR-0041 §3-§4) — le flux iCal d'export d'un bien : réservations confirmées et
 * blocages manuels, aucune donnée personnelle, un jeton haché que la régénération tue.
 */
class IcalExportTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    private function day(int $offset): string
    {
        return now()->addDays($offset)->toDateString();
    }

    private function ymd(int $offset): string
    {
        return now()->addDays($offset)->format('Ymd');
    }

    /** Le chemin relatif de l'URL d'export rendue une fois. */
    private function generate(): string
    {
        Sanctum::actingAs($this->landlord);
        $url = $this->postJson("/api/properties/{$this->property->id}/ical-token")->assertCreated()->json('data.url');
        $this->assertMatchesRegularExpression('#/ical/[0-9a-f]{64}\.ics$#', $url);

        return (string) parse_url($url, PHP_URL_PATH);
    }

    public function test_the_feed_carries_confirmed_stays_and_manual_blocks_and_no_personal_data(): void
    {
        $this->client->update(['first_name' => 'Aïssatou', 'last_name' => 'Diallo', 'phone' => '+221771234567']);
        $confirmed = $this->bookingOfClient([
            'status' => BookingStatus::Confirmed, 'confirmed_at' => now(),
            'start_date' => $this->day(10), 'end_date' => $this->day(13),
        ]);
        $this->bookingOfClient(['status' => BookingStatus::Pending, 'start_date' => $this->day(20), 'end_date' => $this->day(22)]);
        PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(30), 'ends_on' => $this->day(31),
            'source' => 'manual', 'reason' => 'Mariage de ma sœur',
        ]);
        $feed = PropertyCalendarFeed::query()->create([
            'property_id' => $this->property->id, 'url' => 'https://cal.example.com/a.ics', 'url_host' => 'cal.example.com',
        ]);
        PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(40), 'ends_on' => $this->day(42),
            'source' => 'ical', 'calendar_feed_id' => $feed->id, 'external_uid' => 'echo@airbnb',
        ]);

        $path = $this->generate();
        $this->app['auth']->forgetGuards();

        $response = $this->get($path)->assertOk();
        $this->assertSame('text/calendar; charset=utf-8', $response->headers->get('Content-Type'));
        $body = $response->getContent();

        $this->assertStringContainsString('DTSTART;VALUE=DATE:'.$this->ymd(10), $body);
        $this->assertStringContainsString('DTEND;VALUE=DATE:'.$this->ymd(13), $body);
        $this->assertStringContainsString('DTSTART;VALUE=DATE:'.$this->ymd(30), $body);
        $this->assertStringContainsString('SUMMARY:Réservé', $body);
        $this->assertStringContainsString('SUMMARY:Indisponible', $body);
        // Ni la demande en attente, ni l'écho d'un flux importé.
        $this->assertStringNotContainsString($this->ymd(20), $body);
        $this->assertStringNotContainsString($this->ymd(40), $body);
        // Aucune donnée personnelle.
        foreach (['Aïssatou', 'Diallo', '221771234567', '771234567', $confirmed->reference_number, 'Mariage', $this->client->email] as $secret) {
            $this->assertStringNotContainsString((string) $secret, $body);
        }
        $this->assertNull($response->headers->get('Set-Cookie'));
    }

    public function test_a_wrong_token_is_not_found(): void
    {
        $this->generate();

        $this->get('/ical/'.str_repeat('a', 64).'.ics')->assertNotFound();
        $this->get('/ical/not-a-token.ics')->assertNotFound();
    }

    public function test_regenerating_kills_the_previous_token(): void
    {
        $old = $this->generate();
        $new = $this->generate();
        $this->assertNotSame($old, $new);

        $this->get($old)->assertNotFound();
        $this->get($new)->assertOk();
    }

    /** Le jeton n'est stocké que haché, et l'empreinte ne ressort pas de l'API du bien. */
    public function test_the_token_is_stored_hashed_and_never_served_back(): void
    {
        $path = $this->generate();
        $token = basename($path, '.ics');

        $stored = $this->property->fresh()->ical_export_token_hash;
        $this->assertSame(hash('sha256', $token), $stored);
        $this->assertDatabaseMissing('properties', ['ical_export_token_hash' => $token]);

        $this->getJson("/api/properties/{$this->property->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.ical_export_token_hash');
        $this->assertStringNotContainsString($stored, $this->getJson("/api/properties/{$this->property->id}")->getContent());
    }

    public function test_someone_who_cannot_edit_the_property_cannot_mint_a_token(): void
    {
        foreach ([$this->client, $this->agencyAgent(Agency::factory()->create())] as $user) {
            Sanctum::actingAs($user);
            $this->postJson("/api/properties/{$this->property->id}/ical-token")->assertForbidden();
        }

        $this->assertNull($this->property->fresh()->ical_export_token_hash);
    }
}
