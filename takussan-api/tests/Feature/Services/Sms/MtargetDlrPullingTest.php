<?php

namespace Tests\Feature\Services\Sms;

use App\Models\AppNotification;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-294 — Mtarget delivery reports pulled by us instead of pushed to an
 * unauthenticated webhook (ardoise D-49).
 *
 * The flow inverts: our server calls `POST {pull_url}` with the account
 * credentials, so there is nothing inbound left to authenticate. What the
 * tests below pin down is the part that does NOT depend on the operator:
 * the read is destructive server-side (Mtarget drains the queue), so
 * **idempotence lives entirely on the write side** — a report only ever
 * UPDATEs an attempt matched on `(provider, provider_message_id)`, never
 * inserts one.
 */
class MtargetDlrPullingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.dlr_pulling.enabled', true);
        config()->set('sms.dlr_pulling.driver', 'mtarget');
        config()->set('sms.dlr_pulling.max_per_call', 50);
        config()->set('sms.dlr_pulling.max_batches', 5);
        config()->set('sms.mtarget.pull_url', 'https://api-public-2.mtarget.fr/notification');
    }

    private function makeIntegration(): Integration
    {
        return Integration::create([
            'provider' => 'sms_mtarget',
            'agency_id' => null,
            'credentials' => ['username' => 'mtg-user', 'password' => 'mtg-pass'],
            'is_active' => true,
        ]);
    }

    private function makeAttempt(string $providerMessageId, string $status = SmsResult::STATUS_SENT): NotificationDeliveryAttempt
    {
        $user = User::factory()->create();
        $notification = AppNotification::factory()->create(['user_id' => $user->id]);

        return NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => 'mtarget',
            'to' => '+221771111111',
            'status' => $status,
            'provider_message_id' => $providerMessageId,
            'sent_at' => now(),
        ]);
    }

    /**
     * @param  list<array<string,mixed>>  ...$pages
     */
    private function fakeSequence(array ...$pages): void
    {
        $sequence = Http::sequence();
        foreach ($pages as $page) {
            $sequence->push(['results' => $page]);
        }
        $sequence->whenEmpty(Http::response(['results' => []]));
        Http::fake(['api-public-2.mtarget.fr/*' => $sequence]);
    }

    // ─── AC1 — a status comes back with no inbound request ────────────

    public function test_a_pulled_delivered_report_marks_the_attempt_delivered(): void
    {
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-ticket-1|+221771111111');
        $this->fakeSequence([[
            'ticket' => 'mtg-ticket-1',
            'msisdn' => '221771111111',
            'Status' => 3,
            'reason' => 'OK',
            'smscount' => '1',
        ]]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempt->refresh()->status);
        $this->assertNotNull($attempt->delivered_at);
    }

    public function test_the_call_carries_the_account_credentials(): void
    {
        $this->makeIntegration();
        $this->makeAttempt('mtg-ticket-1|+221771111111');
        $this->fakeSequence([]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://api-public-2.mtarget.fr/notification'
                && $request['username'] === 'mtg-user'
                && $request['password'] === 'mtg-pass'
                && (int) $request['max'] === 50;
        });
    }

    public function test_a_ticket_without_the_msisdn_suffix_still_matches(): void
    {
        // Single-recipient sends predating the `ticket|+msisdn` disambiguation
        // (and any provider that returns the bare ticket) must still resolve.
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-bare-ticket');
        $this->fakeSequence([[
            'ticket' => 'mtg-bare-ticket',
            'msisdn' => '221771111111',
            'Status' => 3,
        ]]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempt->refresh()->status);
    }

    public function test_the_webhook_field_names_are_also_accepted(): void
    {
        // The pulling doc shows `ticket`/`msisdn`; the push doc shows
        // `MsgId`/`DestinationAdress`/`StatusText`. Which naming the pulling
        // stream uses for a DLR row is NOT documented — accept both rather
        // than silently drop half the reports.
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-alias|+221771111111');
        $this->fakeSequence([[
            'MsgId' => 'mtg-alias',
            'DestinationAdress' => '221771111111',
            'Status' => 6,
            'StatusText' => 'ABSENT_SUBSCRIBER',
        ]]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        $attempt->refresh();
        $this->assertSame(SmsResult::STATUS_FAILED, $attempt->status);
        $this->assertSame('ABSENT_SUBSCRIBER', $attempt->failure_reason);
    }

    // ─── AC2 — replaying the same reports duplicates nothing ──────────

    public function test_replaying_the_same_reports_duplicates_no_attempt_and_no_notification(): void
    {
        Notification::fake();
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-replay|+221771111111');
        $record = [[
            'ticket' => 'mtg-replay',
            'msisdn' => '221771111111',
            'Status' => 3,
        ]];

        $this->fakeSequence($record);
        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);
        $this->fakeSequence($record);
        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        $this->assertSame(1, NotificationDeliveryAttempt::query()->where('provider', 'mtarget')->count());
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempt->refresh()->status);
        Notification::assertNothingSent();
    }

    public function test_a_late_intermediate_report_never_regresses_a_delivered_attempt(): void
    {
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-late|+221771111111', SmsResult::STATUS_DELIVERED);
        $attempt->forceFill(['delivered_at' => now()])->save();

        // Status 2 = "sent to operator", an intermediate that can be drained
        // after the terminal 3 when a queue is read out of order.
        $this->fakeSequence([[
            'ticket' => 'mtg-late',
            'msisdn' => '221771111111',
            'Status' => 2,
        ]]);
        // The counter is asserted, not just the row: without the
        // intermediate branch the record would fall through to
        // "unknown status" and the row would look identical.
        $this->artisan('sms:pull-mtarget-dlr')
            ->expectsOutputToContain('intermediate')
            ->assertExitCode(0);

        $attempt->refresh();
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempt->status);
        $this->assertNotNull($attempt->delivered_at);
    }

    public function test_a_stale_delivered_report_never_overwrites_a_failed_attempt(): void
    {
        // Status precedence, same ordering as the WhatsApp DLR consumer:
        // the operator's last word on a failure stands. Drop the
        // `statusPrecedence` argument and this row flips to `delivered`.
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-stale|+221771111111', SmsResult::STATUS_FAILED);
        $this->fakeSequence([[
            'ticket' => 'mtg-stale',
            'msisdn' => '221771111111',
            'Status' => 3,
        ]]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        $this->assertSame(SmsResult::STATUS_FAILED, $attempt->refresh()->status);
    }

    public function test_a_mobile_originated_message_is_not_applied_as_a_delivery_report(): void
    {
        // Status 5 is an MO (inbound SMS) in the pulling stream, not a DLR.
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-mo|+221771111111');
        $this->fakeSequence([[
            'ticket' => 'mtg-mo',
            'msisdn' => '221771111111',
            'Status' => 5,
            'text' => 'STOP',
        ]]);

        $this->artisan('sms:pull-mtarget-dlr')
            ->expectsOutputToContain('mobile_originated')
            ->assertExitCode(0);

        $this->assertSame(SmsResult::STATUS_SENT, $attempt->refresh()->status);
    }

    // ─── AC3 — an outage is loud, and changes nothing ─────────────────

    public function test_an_http_failure_is_logged_and_leaves_the_status_untouched(): void
    {
        Log::spy();
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-outage|+221771111111');
        Http::fake(['api-public-2.mtarget.fr/*' => Http::response('gateway down', 502)]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(1);

        $this->assertSame(SmsResult::STATUS_SENT, $attempt->refresh()->status);
        Log::shouldHaveReceived('error')
            ->withArgs(fn (string $message) => str_contains($message, '[sms.mtarget.pull]'));
    }

    public function test_a_credential_error_row_is_treated_as_a_failed_call_not_as_a_report(): void
    {
        // Mtarget reports API-level errors *inside* `results` with a negative
        // `code` and a literal "null" ticket. Mistaking that for a DLR would
        // mark a real message failed on an authentication problem.
        Log::spy();
        $this->makeIntegration();
        $attempt = $this->makeAttempt('mtg-cred|+221771111111');
        Http::fake(['api-public-2.mtarget.fr/*' => Http::response(['results' => [[
            'msisdn' => 'null',
            'smscount' => '0',
            'code' => '-12',
            'reason' => 'invalid credential',
            'ticket' => 'null',
        ]]])]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(1);

        $this->assertSame(SmsResult::STATUS_SENT, $attempt->refresh()->status);
    }

    public function test_a_missing_integration_fails_loudly_rather_than_silently(): void
    {
        Log::spy();
        $this->makeAttempt('mtg-noint|+221771111111');
        Http::fake();

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(1);

        Http::assertNothingSent();
    }

    // ─── Draining, cadence and the off switch ─────────────────────────

    public function test_it_keeps_draining_until_the_queue_is_empty(): void
    {
        $this->makeIntegration();
        $one = $this->makeAttempt('mtg-p1|+221771111111');
        $two = $this->makeAttempt('mtg-p2|+221771111111');
        $this->fakeSequence(
            [['ticket' => 'mtg-p1', 'msisdn' => '221771111111', 'Status' => 3]],
            [['ticket' => 'mtg-p2', 'msisdn' => '221771111111', 'Status' => 3]],
        );

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        $this->assertSame(SmsResult::STATUS_DELIVERED, $one->refresh()->status);
        $this->assertSame(SmsResult::STATUS_DELIVERED, $two->refresh()->status);
        Http::assertSentCount(3); // two full pages + the empty one that stops the loop
    }

    public function test_the_batch_ceiling_bounds_a_single_run(): void
    {
        config()->set('sms.dlr_pulling.max_batches', 2);
        $this->makeIntegration();
        $this->makeAttempt('mtg-b1|+221771111111');
        Http::fake(['api-public-2.mtarget.fr/*' => Http::response(['results' => [
            ['ticket' => 'mtg-b1', 'msisdn' => '221771111111', 'Status' => 3],
        ]])]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        Http::assertSentCount(2);
    }

    public function test_pulling_disabled_makes_no_call_at_all(): void
    {
        config()->set('sms.dlr_pulling.enabled', false);
        $this->makeIntegration();
        Http::fake();

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        Http::assertNothingSent();
    }

    public function test_the_log_driver_makes_no_network_call(): void
    {
        // Default configuration: pulling is wired but points at the inert
        // driver, so a fresh checkout never talks to the operator.
        config()->set('sms.dlr_pulling.driver', 'log');
        $this->makeIntegration();
        Http::fake();

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        Http::assertNothingSent();
    }

    public function test_an_unmatched_ticket_is_reported_and_not_swallowed(): void
    {
        // The read is destructive: a report we cannot match is gone from the
        // operator's queue. It must leave a trace.
        Log::spy();
        $this->makeIntegration();
        $this->fakeSequence([[
            'ticket' => 'unknown-ticket',
            'msisdn' => '221771111111',
            'Status' => 3,
        ]]);

        $this->artisan('sms:pull-mtarget-dlr')->assertExitCode(0);

        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $message) => str_contains($message, '[sms.mtarget.pull]'));
    }
}
