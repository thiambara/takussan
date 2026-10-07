<?php

namespace Tests\Feature\Calendar;

use App\Models\Agency;
use App\Models\CalendarFeed;
use App\Models\Enums\UserStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-591 AC10 (ADR-0034) — le flux iCalendar : valide, sans tiers, mort après révocation ou
 * retrait, jeton jamais stocké en clair.
 */
class CalendarFeedTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);

        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Appartement Plateau, vue mer']);
        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $this->agent->id,
            'visitor_name' => 'Moussa Sow',
            'visitor_phone' => '+221771112233',
            'visitor_email' => 'moussa@example.sn',
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(3)->setTime(10, 0),
            'duration_minutes' => 45,
        ]);
    }

    private function issue(): string
    {
        $url = $this->actingAsApi($this->agent)->apiPost('/api/me/calendar-feed')
            ->assertCreated()
            ->json('data.url');

        $this->assertMatchesRegularExpression('#/api/calendar-feed/[A-Za-z0-9]{40}\.ics$#', $url);

        return (string) parse_url($url, PHP_URL_PATH);
    }

    private function token(string $path): string
    {
        return basename($path, '.ics');
    }

    public function test_the_feed_is_a_valid_vcalendar_without_third_party_data(): void
    {
        $path = $this->issue();
        $this->app['auth']->forgetGuards();

        $response = $this->get($path)->assertOk();

        $this->assertStringStartsWith('text/calendar', (string) $response->headers->get('Content-Type'));
        $body = $response->getContent();
        $this->assertStringStartsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n", $body);
        $this->assertStringEndsWith("END:VCALENDAR\r\n", $body);
        $this->assertSame(1, substr_count($body, 'BEGIN:VEVENT'));
        $this->assertSame(substr_count($body, 'BEGIN:VEVENT'), substr_count($body, 'END:VEVENT'));
        $this->assertStringContainsString('UID:visit-', $body);
        // Échappement RFC 5545 de la virgule du titre.
        $this->assertStringContainsString('Appartement Plateau\\, vue mer', $body);
        foreach (explode("\r\n", rtrim($body, "\r\n")) as $line) {
            $this->assertLessThanOrEqual(75, strlen($line));
        }

        foreach (['Moussa', 'Sow', '771112233', 'moussa@example.sn'] as $thirdParty) {
            $this->assertStringNotContainsString($thirdParty, $body);
        }

        $this->assertNotNull(CalendarFeed::query()->sole()->last_accessed_at);
    }

    public function test_the_token_is_never_stored_in_clear(): void
    {
        $token = $this->token($this->issue());

        $row = (array) DB::table('calendar_feeds')->first();
        $this->assertNotContains($token, $row);
        $this->assertSame(hash('sha256', $token), $row['token_hash']);
        $this->assertStringNotContainsString($token, json_encode(DB::table('activity_log')->get()));
    }

    public function test_revocation_and_rotation_kill_the_old_link(): void
    {
        $first = $this->issue();
        $second = $this->issue();

        $this->get($first)->assertNotFound();
        $this->get($second)->assertOk();

        $this->actingAsApi($this->agent)->apiDelete('/api/me/calendar-feed')->assertNoContent();
        $this->get($second)->assertNotFound();

        $this->actingAsApi($this->agent)->apiGet('/api/me/calendar-feed')
            ->assertOk()
            ->assertJsonPath('data.active', false);
    }

    public function test_the_feed_dies_when_its_holder_is_no_longer_staff(): void
    {
        $path = $this->issue();
        $this->get($path)->assertOk();

        AgentProfile::query()->where('user_id', $this->agent->id)->delete();

        $this->get($path)->assertNotFound();
    }

    public function test_an_unknown_token_is_a_404(): void
    {
        $this->get('/api/calendar-feed/'.str_repeat('a', 40).'.ics')->assertNotFound();
    }

    /**
     * verif-591 M4 — bloquer un compte coupe son flux : le blocage révoque ses liens, et un lien qui
     * aurait survécu n'est pas servi tant que le compte n'est pas actif.
     */
    public function test_blocking_the_account_kills_its_feed(): void
    {
        $path = $this->issue();
        $this->get($path)->assertOk();

        $root = User::factory()->create();
        $this->materializeRoleProfile($root, 'super_admin');
        $this->actingAsApi($root)->apiPost("/api/users/{$this->agent->id}/block")->assertOk();
        $this->app['auth']->forgetGuards();

        $this->assertNotNull(CalendarFeed::query()->where('user_id', $this->agent->id)->sole()->revoked_at);
        $this->get($path)->assertNotFound();

        // Un lien qui aurait survécu au blocage (posé à la main) n'est pas servi non plus.
        CalendarFeed::query()->where('user_id', $this->agent->id)->update(['revoked_at' => null]);
        $this->get($path)->assertNotFound();
        $this->agent->fresh()->update(['status' => UserStatus::Active]);
        $this->get($path)->assertOk();
    }
}
