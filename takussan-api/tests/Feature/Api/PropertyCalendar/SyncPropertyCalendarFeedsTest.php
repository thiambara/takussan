<?php

namespace Tests\Feature\Api\PropertyCalendar;

use App\Jobs\SyncPropertyCalendarFeedJob;
use App\Jobs\SyncPropertyCalendarFeedsJob;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\PropertyCalendarFeed;
use App\Models\PropertyUnavailability;
use App\Models\User;
use App\Services\Booking\PropertyCalendarSyncService;
use App\Services\Property\PropertyPublication;
use App\Support\Http\DnsResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-596 §3B (AC9, ADR-0041 §5-§7) — l'import d'un flux iCal : il crée, déplace et retire les
 * indisponibilités ; il signale un conflit sans toucher à la réservation ; et une URL qui vise le
 * serveur lui-même, ses métadonnées ou le réseau privé est refusée SANS requête sortante.
 */
class SyncPropertyCalendarFeedsTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private const URL = 'https://cal.example.com/export/abc.ics';

    /** @var array<string, list<string>> */
    private array $dns = [];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();
        $this->buildStakeholders();

        $this->dns = [
            'cal.example.com' => ['93.184.216.34'],
            'intranet.example.com' => ['10.0.0.5'],
            'mixed.example.com' => ['93.184.216.34', '192.168.1.10'],
        ];
        $test = $this;
        $this->app->instance(DnsResolver::class, new class($test) extends DnsResolver
        {
            public function __construct(private readonly SyncPropertyCalendarFeedsTest $test) {}

            public function resolve(string $host): array
            {
                return filter_var($host, FILTER_VALIDATE_IP) !== false ? [$host] : $this->test->resolved($host);
            }
        });
    }

    /** @return list<string> */
    public function resolved(string $host): array
    {
        return $this->dns[$host] ?? [];
    }

    private function day(int $offset): string
    {
        return now()->addDays($offset)->format('Ymd');
    }

    /** @param  list<array{0: string, 1: int, 2: int, 3?: string}>  $events  [uid, from, to, status] */
    private function ics(array $events): string
    {
        $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airbnb Inc//Hosting Calendar//EN'];
        foreach ($events as $e) {
            $lines[] = 'BEGIN:VEVENT';
            $lines[] = 'UID:'.$e[0];
            $lines[] = 'DTSTART;VALUE=DATE:'.$this->day($e[1]);
            $lines[] = 'DTEND;VALUE=DATE:'.$this->day($e[2]);
            $lines[] = 'SUMMARY:Reserved';
            if (isset($e[3])) {
                $lines[] = 'STATUS:'.$e[3];
            }
            $lines[] = 'END:VEVENT';
        }
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", $lines)."\r\n";
    }

    private function register(string $url = self::URL): TestResponse
    {
        Sanctum::actingAs($this->landlord);

        return $this->postJson("/api/properties/{$this->property->id}/calendar-feeds", ['url' => $url, 'label' => 'Airbnb']);
    }

    private function feed(): PropertyCalendarFeed
    {
        return PropertyCalendarFeed::query()->sole();
    }

    private function sync(): bool
    {
        return app(PropertyCalendarSyncService::class)->sync($this->feed());
    }

    /** @return list<array{0: string, 1: string, 2: string}> */
    private function imported(): array
    {
        return PropertyUnavailability::query()->where('source', 'ical')->orderBy('starts_on')->get()
            ->map(fn (PropertyUnavailability $u): array => [$u->external_uid, $u->starts_on->format('Ymd'), $u->ends_on->format('Ymd')])
            ->all();
    }

    public function test_registering_a_feed_imports_its_events_and_never_serves_the_url_back(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([['a@airbnb', 5, 8], ['b@airbnb', 20, 22]]))]);

        // La file est `sync` en test : la tâche de première synchronisation (m3) a déjà tourné.
        $response = $this->register()->assertCreated()
            ->assertJsonPath('data.url_host', 'cal.example.com')
            ->assertJsonMissingPath('data.url');
        $this->assertSame('ok', $this->feed()->last_status);
        $this->assertStringNotContainsString('abc.ics', $response->getContent());
        $this->assertStringNotContainsString('abc.ics', $this->getJson("/api/properties/{$this->property->id}/calendar-feeds")->getContent());

        $this->assertSame([['a@airbnb', $this->day(5), $this->day(8)], ['b@airbnb', $this->day(20), $this->day(22)]], $this->imported());
        // Chiffrée en base : la colonne ne porte pas l'URL en clair.
        $this->assertStringNotContainsString('cal.example.com', (string) DB::table('property_calendar_feeds')->value('url'));
        $this->assertSame(self::URL, $this->feed()->url);
    }

    /**
     * VERIF-596 m3 — la première synchronisation quittait la requête de création : un appel sortant
     * de 10 s au plus, tenu par un worker HTTP. Elle part désormais en file, le flux rendu `pending`.
     */
    public function test_registering_a_feed_answers_pending_and_queues_the_first_sync(): void
    {
        Queue::fake();
        Http::fake();

        $this->register()->assertCreated()
            ->assertJsonPath('data.last_status', PropertyCalendarFeed::STATUS_PENDING)
            ->assertJsonPath('data.last_synced_at', null);

        Http::assertNothingSent();
        $feed = $this->feed();
        $this->assertSame(PropertyCalendarFeed::STATUS_PENDING, $feed->last_status);
        Queue::assertPushed(SyncPropertyCalendarFeedJob::class, fn (SyncPropertyCalendarFeedJob $job): bool => $job->feedId === $feed->id);
    }

    public function test_the_queued_first_sync_skips_a_feed_deleted_meanwhile(): void
    {
        Http::fake();
        Queue::fake();
        $this->register()->assertCreated();
        $id = $this->feed()->id;
        $this->feed()->delete();

        (new SyncPropertyCalendarFeedJob($id))->handle(app(PropertyCalendarSyncService::class));

        Http::assertNothingSent();
    }

    /** VERIF-596 m4 — dix créations par heure et par utilisateur, quel que soit le bien ; la 11ᵉ rend 429. */
    public function test_an_eleventh_feed_creation_within_the_hour_is_throttled_per_user(): void
    {
        Queue::fake();
        for ($i = 0; $i < 10; $i++) {
            $this->register()->assertCreated();
        }
        $other = Property::factory()->create(['user_id' => $this->landlord->id]);

        $this->postJson("/api/properties/{$other->id}/calendar-feeds", ['url' => self::URL])->assertStatus(429);
        $this->assertSame(0, $other->calendarFeeds()->count());

        // Le compteur est celui de l'utilisateur : un autre bailleur crée encore le sien.
        $neighbour = User::factory()->create();
        $theirs = Property::factory()->create(['user_id' => $neighbour->id, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Daily, 'status' => PropertyStatus::Available]);
        Sanctum::actingAs($neighbour);
        $this->postJson("/api/properties/{$theirs->id}/calendar-feeds", ['url' => self::URL])->assertCreated();
    }

    public function test_a_resync_moves_changed_events_and_removes_vanished_and_cancelled_ones(): void
    {
        Http::fakeSequence('cal.example.com/*')
            ->push($this->ics([['a@airbnb', 5, 8], ['b@airbnb', 20, 22], ['c@airbnb', 30, 31]]))
            ->push($this->ics([['a@airbnb', 6, 9], ['c@airbnb', 30, 31, 'CANCELLED']]));
        $this->register()->assertCreated();
        $before = PropertyUnavailability::query()->where('external_uid', 'a@airbnb')->value('id');

        $this->assertTrue($this->sync());

        $this->assertSame([['a@airbnb', $this->day(6), $this->day(9)]], $this->imported());
        $this->assertSame($before, PropertyUnavailability::query()->where('external_uid', 'a@airbnb')->value('id'));
    }

    /** Une plage MANUELLE n'appartient à aucun flux : la synchronisation n'y touche pas. */
    public function test_a_resync_leaves_manual_blocks_alone(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([]))]);
        $manual = PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => now()->addDays(3)->toDateString(),
            'ends_on' => now()->addDays(4)->toDateString(), 'source' => 'manual',
        ]);

        $this->register()->assertCreated();

        $this->assertModelExists($manual);
    }

    public function test_a_conflict_is_flagged_and_notified_once_and_the_booking_stays_confirmed(): void
    {
        $booking = $this->bookingOfClient([
            'status' => BookingStatus::Confirmed, 'confirmed_at' => now(),
            'start_date' => now()->addDays(10)->toDateString(), 'end_date' => now()->addDays(13)->toDateString(),
        ]);
        Http::fake(['cal.example.com/*' => Http::response($this->ics([['x@airbnb', 12, 14], ['y@airbnb', 13, 15]]))]);

        $this->register()->assertCreated();

        $conflicted = PropertyUnavailability::query()->where('external_uid', 'x@airbnb')->sole();
        $this->assertSame($booking->id, (int) $conflicted->conflict_booking_id);
        // Arriver le jour du départ n'est pas un conflit.
        $this->assertNull(PropertyUnavailability::query()->where('external_uid', 'y@airbnb')->value('conflict_booking_id'));
        $this->assertSame(BookingStatus::Confirmed, $booking->fresh()->status);

        $recipients = AppNotification::query()->where('code', 'property.calendar_conflict')->orderBy('user_id')->pluck('user_id')->map(fn ($id) => (int) $id)->all();
        $expected = [$this->landlord->id, $this->agent->id];
        sort($expected);
        $this->assertSame($expected, $recipients);

        // Le même conflit, resynchronisé, ne repart pas.
        $this->assertTrue($this->sync());
        $this->assertSame(2, AppNotification::query()->where('code', 'property.calendar_conflict')->count());
        $this->assertSame(BookingStatus::Confirmed, $booking->fresh()->status);
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function unsafeUrls(): array
    {
        return [
            'bouclage' => ['https://127.0.0.1/cal.ics', 'private_address'],
            'métadonnées du VPS' => ['https://169.254.169.254/latest/meta-data', 'private_address'],
            'réseau privé 10/8' => ['https://10.1.2.3/cal.ics', 'private_address'],
            'nom qui résout en 10/8' => ['https://intranet.example.com/cal.ics', 'private_address'],
            'une adresse privée parmi d\'autres' => ['https://mixed.example.com/cal.ics', 'private_address'],
            'IPv6 bouclage' => ['https://[::1]/cal.ics', 'private_address'],
            'IPv4 mappée' => ['https://[::ffff:127.0.0.1]/cal.ics', 'private_address'],
            'NAT64 vers les métadonnées' => ['https://[64:ff9b::a9fe:a9fe]/cal.ics', 'private_address'],
            'http en clair' => ['http://cal.example.com/cal.ics', 'not_https'],
            'autre port' => ['https://cal.example.com:6379/cal.ics', 'port_not_allowed'],
            'nom qui ne résout pas' => ['https://nowhere.example.com/cal.ics', 'unresolvable'],
        ];
    }

    #[DataProvider('unsafeUrls')]
    public function test_an_unsafe_url_is_refused_without_any_outbound_request(string $url, string $reason): void
    {
        Http::fake();

        $response = $this->register($url)->assertStatus(422);
        if ($reason !== 'not_https') {
            $response->assertJsonPath('code', 'calendar_feed.unsafe_url');
        }

        Http::assertNothingSent();
        $this->assertSame(0, PropertyCalendarFeed::query()->count());
    }

    /** Second chemin : l'hôte vérifié à l'enregistrement rebondit ensuite vers une adresse interne. */
    public function test_a_host_that_later_resolves_to_a_private_address_is_not_fetched(): void
    {
        Http::fakeSequence('cal.example.com/*')->push($this->ics([['a@airbnb', 5, 8]]));
        $this->register()->assertCreated();
        Http::fake();
        $this->dns['cal.example.com'] = ['169.254.169.254'];

        $this->assertFalse($this->sync());

        Http::assertNothingSent();
        $this->assertSame('private_address', $this->feed()->last_error);
        $this->assertCount(1, $this->imported());
    }

    public function test_a_response_over_one_megabyte_is_refused_and_imports_nothing(): void
    {
        $big = $this->ics([['a@airbnb', 5, 8]]).str_repeat('X', 1_048_577);
        Http::fake(['cal.example.com/*' => Http::response($big)]);

        $this->register()->assertCreated();
        $this->assertSame(['failed', 'too_large'], [$this->feed()->last_status, $this->feed()->last_error]);

        $this->assertSame([], $this->imported());
    }

    public function test_a_redirect_is_not_followed(): void
    {
        Http::fake(['cal.example.com/*' => Http::response('', 302, ['Location' => 'https://169.254.169.254/'])]);

        $this->register()->assertCreated();
        $this->assertSame('redirect', $this->feed()->last_error);

        Http::assertSentCount(1);
    }

    public function test_the_landlord_is_warned_once_at_the_third_consecutive_failure(): void
    {
        Http::fake(['cal.example.com/*' => Http::response('', 503)]);
        $this->register()->assertCreated();
        $alerts = fn (): int => AppNotification::query()->where('code', 'property.calendar_feed_failing')->count();

        $this->sync();
        $this->assertSame(0, $alerts());
        $this->sync();
        $this->assertSame(1, $alerts());
        $this->assertSame($this->landlord->id, (int) AppNotification::query()->where('code', 'property.calendar_feed_failing')->value('user_id'));
        $this->sync();
        $this->sync();
        $this->assertSame(1, $alerts());
        $this->assertSame(5, $this->feed()->consecutive_failures);
        $this->assertNotNull($this->feed()->failing_since);
    }

    public function test_a_success_resets_the_failure_count(): void
    {
        Http::fakeSequence('cal.example.com/*')
            ->push('', 503)->push('', 503)->push($this->ics([]));
        $this->register()->assertCreated();
        $this->sync();
        $this->assertSame(2, $this->feed()->consecutive_failures);

        $this->assertTrue($this->sync());
        $this->assertSame(0, $this->feed()->consecutive_failures);
        $this->assertNull($this->feed()->failing_since);
    }

    public function test_sync_now_is_limited_to_one_call_per_minute_per_feed(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([]))]);
        $this->register()->assertCreated();
        $feed = $this->feed();

        $this->postJson("/api/property-calendar-feeds/{$feed->id}/sync")->assertOk();
        $this->postJson("/api/property-calendar-feeds/{$feed->id}/sync")->assertStatus(429)->assertJsonPath('code', 'calendar_feed.sync_throttled');
    }

    public function test_someone_who_cannot_edit_the_property_reaches_no_feed(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([]))]);
        $this->register()->assertCreated();
        $feed = $this->feed();

        foreach ([$this->client, $this->agencyAgent(Agency::factory()->create())] as $user) {
            Sanctum::actingAs($user);
            $this->getJson("/api/properties/{$this->property->id}/calendar-feeds")->assertForbidden();
            $this->postJson("/api/properties/{$this->property->id}/calendar-feeds", ['url' => self::URL])->assertForbidden();
            $this->postJson("/api/property-calendar-feeds/{$feed->id}/sync")->assertForbidden();
            $this->deleteJson("/api/property-calendar-feeds/{$feed->id}")->assertForbidden();
        }

        $this->assertModelExists($feed);
        Http::assertSentCount(1);
    }

    public function test_deleting_a_feed_removes_its_imported_dates(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([['a@airbnb', 5, 8]]))]);
        $this->register()->assertCreated();

        $this->deleteJson("/api/property-calendar-feeds/{$this->feed()->id}")->assertNoContent();

        $this->assertSame([], $this->imported());
    }

    public function test_a_property_holds_at_most_ten_feeds(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([]))]);
        // Posés directement : dix créations par la route épuiseraient le limiteur horaire (m4).
        for ($i = 0; $i < 10; $i++) {
            $this->property->calendarFeeds()->create(['url' => self::URL.'?n='.$i, 'url_host' => 'cal.example.com', 'created_by_id' => $this->landlord->id]);
        }

        $this->register(self::URL.'?n=10')->assertStatus(422)->assertJsonPath('code', 'calendar_feed.limit_reached');
    }

    public function test_the_hourly_job_syncs_every_feed(): void
    {
        Http::fakeSequence('cal.example.com/*')->push($this->ics([]))->push($this->ics([['a@airbnb', 5, 8]]));
        $this->register()->assertCreated();

        (new SyncPropertyCalendarFeedsJob)->handle(app(PropertyCalendarSyncService::class));

        $this->assertCount(1, $this->imported());
    }

    /** Un UID répété (récurrence) : la première occurrence, et la synchronisation aboutit. */
    public function test_a_repeated_uid_imports_one_range_and_the_sync_succeeds(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([['r@g', 5, 6], ['r@g', 12, 13]]))]);

        $this->register()->assertCreated();
        $this->assertSame('ok', $this->feed()->last_status);

        $this->assertSame([['r@g', $this->day(5), $this->day(6)]], $this->imported());
    }

    /** Un événement passé n'occupe rien : il n'est pas importé. */
    public function test_past_events_are_not_imported(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([['old@airbnb', -10, -7], ['now@airbnb', -1, 2]]))]);

        $this->register()->assertCreated();

        $this->assertSame(['now@airbnb'], array_column($this->imported(), 0));
        $this->assertSame(0, Booking::query()->count());
    }

    /**
     * VERIF-596 passe 2 (n2) — un bien archivé par `PropertyPublication` (591) exportait encore son
     * calendrier (200) et l'import horaire faisait une requête sortante par flux et par heure.
     * Désarchivé, il retrouve les deux.
     */
    public function test_an_archived_property_neither_exports_nor_imports_its_calendar(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([['a@airbnb', 5, 8]]))]);
        $this->register()->assertCreated();
        $path = (string) parse_url((string) $this->postJson("/api/properties/{$this->property->id}/ical-token")->assertCreated()->json('data.url'), PHP_URL_PATH);
        $this->property->update(app(PropertyPublication::class)->archivedAttributes());
        Http::fake();

        $this->get($path)->assertNotFound();
        (new SyncPropertyCalendarFeedsJob)->handle(app(PropertyCalendarSyncService::class));
        Http::assertNothingSent();
        $this->postJson("/api/property-calendar-feeds/{$this->feed()->id}/sync")
            ->assertStatus(422)->assertJsonPath('code', 'calendar_feed.property_closed');
        $this->postJson("/api/properties/{$this->property->id}/calendar-feeds", ['url' => self::URL])
            ->assertStatus(422)->assertJsonPath('code', 'calendar_feed.property_closed');

        $this->property->update(['status' => PropertyStatus::Available, 'archived_at' => null]);
        $this->get($path)->assertOk();
        Http::fake(['cal.example.com/*' => Http::response($this->ics([]))]);
        (new SyncPropertyCalendarFeedsJob)->handle(app(PropertyCalendarSyncService::class));
        Http::assertSentCount(1);
    }

    /** La première synchronisation, en file, ne part pas si le bien a été archivé entre-temps. */
    public function test_the_queued_first_sync_skips_a_property_archived_meanwhile(): void
    {
        Queue::fake();
        Http::fake();
        $this->register()->assertCreated();
        $this->property->update(app(PropertyPublication::class)->archivedAttributes());

        (new SyncPropertyCalendarFeedJob($this->feed()->id))->handle(app(PropertyCalendarSyncService::class));

        Http::assertNothingSent();
        $this->assertSame(PropertyCalendarFeed::STATUS_PENDING, $this->feed()->last_status);
    }

    /** Un bien qui n'est plus loué à la nuit (location au mois) sort aussi du calendrier d'hôte. */
    public function test_a_property_no_longer_rented_by_the_night_stops_exporting_and_importing(): void
    {
        Http::fake(['cal.example.com/*' => Http::response($this->ics([]))]);
        $this->register()->assertCreated();
        $path = (string) parse_url((string) $this->postJson("/api/properties/{$this->property->id}/ical-token")->assertCreated()->json('data.url'), PHP_URL_PATH);
        $this->property->update(['rent_period' => RentPeriod::Monthly]);
        Http::fake();

        $this->get($path)->assertNotFound();
        (new SyncPropertyCalendarFeedsJob)->handle(app(PropertyCalendarSyncService::class));
        Http::assertNothingSent();
    }
}
