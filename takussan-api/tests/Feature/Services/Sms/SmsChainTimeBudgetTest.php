<?php

namespace Tests\Feature\Services\Sms;

use App\Jobs\SendDeferredSmsJob;
use App\Models\Agency;
use App\Models\Integration;
use App\Notifications\CodedNotification;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-842 (P27.04) — la chaîne de repli tient dans un budget de temps.
 *
 * Chaque appel HTTP d'un pilote avait `timeout(10)` : sur un numéro Orange, un code à usage
 * unique (qui garde le repli même sur un délai dépassé, TCK-766) enchaînait jeton, envoi en 401,
 * nouveau jeton, renvoi, LAfricaMobile et Mtarget, soit 60 s au pire, au-delà des 60 s du worker
 * qui tue le job et le rejoue depuis Orange. Le faux HTTP ci-dessous fait consommer à chaque
 * appel tout le délai qu'on lui accorde (le pire cas), et avance l'horloge d'autant.
 */
class SmsChainTimeBudgetTest extends TestCase
{
    use RefreshDatabase;

    /** Le budget de la chaîne, en secondes : le contrat que ce test fixe. */
    private const BUDGET = 30;

    private const ORANGE = '+221771234567';

    private Agency $agency;

    /** @var list<array{url: string, at: float, timeout: float}> */
    private array $calls = [];

    private CarbonImmutable $start;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        config()->set('sms.webhook_url_token', 'tck-842-test-token');
        config()->set('sms.quiet_hours.enabled', false);
        foreach (['sms_orange', 'sms_lafricamobile', 'sms_mtarget'] as $provider) {
            Integration::create([
                'provider' => $provider,
                'agency_id' => $this->agency->id,
                'credentials' => [
                    'client_id' => 'cid',
                    'client_secret' => 'csec',
                    'sender_address' => 'tel:+221771111111',
                    'username' => 'mtg-user',
                    'password' => 'pass',
                    'accountid' => 'lam-acc',
                    'sender_id' => 'TAKUSSAN',
                ],
                'metadata' => [],
                'is_active' => true,
            ]);
        }
        $this->start = CarbonImmutable::now()->startOfSecond();
        Carbon::setTestNow($this->start);
    }

    /** Fait consommer à l'appel tout son délai, puis rend la réponse (ou lève). */
    private function slow(mixed $outcome): \Closure
    {
        return function (Request $request, array $options) use ($outcome) {
            $timeout = (float) ($options['timeout'] ?? 0);
            $this->calls[] = ['url' => $request->url(), 'at' => $this->elapsed(), 'timeout' => $timeout];
            Carbon::setTestNow(Carbon::now()->addMilliseconds((int) round($timeout * 1000)));

            return $outcome instanceof \Closure ? $outcome() : $outcome;
        };
    }

    private function elapsed(): float
    {
        return $this->start->diffInMilliseconds(Carbon::now(), true) / 1000;
    }

    private function fakeWorstCase(): void
    {
        $oauthCalls = 0;
        $sendCalls = 0;
        Http::preventStrayRequests();
        Http::fake([
            'api.orange.com/oauth/*' => $this->slow(function () use (&$oauthCalls) {
                $oauthCalls++;

                return Http::response(['access_token' => 'tok-'.$oauthCalls, 'expires_in' => 3600]);
            }),
            'api.orange.com/smsmessaging/*' => $this->slow(function () use (&$sendCalls) {
                $sendCalls++;

                return $sendCalls === 1
                    ? Http::response(['error' => 'expired'], 401)
                    : Http::response(['requestError' => ['policyException' => ['messageId' => 'POL0001']]], 400);
            }),
            'lampush*' => $this->slow(fn () => throw new ConnectionException('cURL error 28: Operation timed out')),
            'api-public-2.mtarget.fr/*' => $this->slow(Http::response(['results' => [['code' => 0, 'ticket' => 'mtg-1']]], 200)),
        ]);
    }

    public function test_the_whole_chain_stays_within_its_time_budget(): void
    {
        $this->fakeWorstCase();

        $result = app(SmsRouterDriver::class)->send(self::ORANGE, 'code 123456', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
            'is_otp' => true,
        ])[self::ORANGE];

        $this->assertNotEmpty($this->calls);
        $this->assertLessThanOrEqual(self::BUDGET, $this->elapsed(), 'la chaîne a dépassé son budget : '.json_encode($this->calls));
        foreach ($this->calls as $call) {
            $this->assertLessThanOrEqual(self::BUDGET, $call['at'] + $call['timeout'], 'un appel peut finir après l\'échéance : '.json_encode($call));
        }
        $this->assertSame(SmsResult::STATUS_FAILED, $result->status);
        $this->assertSame('time_budget_exhausted', $result->failureReason);
        $this->assertFalse($result->ambiguous);
    }

    public function test_a_fast_chain_is_not_cut_by_the_budget(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 'tok', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => Http::response(['requestError' => ['policyException' => ['messageId' => 'POL0001']]], 400),
            'lampush*' => Http::response(['push_id' => 'lam-1'], 200),
        ]);

        $result = app(SmsRouterDriver::class)->send(self::ORANGE, 'bonjour', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ])[self::ORANGE];

        $this->assertSame('lafricamobile', $result->provider);
        $this->assertSame(SmsResult::STATUS_SENT, $result->status);
    }

    /**
     * Le job qui porte un SMS ne doit pas être tué en cours de chaîne : son délai couvre le budget
     * de la chaîne, plus un appel WhatsApp (qui se replie en SMS dans le même job), et reste sous
     * le `retry_after` des files (90 s par défaut), sans quoi le job serait repris pendant qu'il tourne.
     */
    public function test_jobs_that_send_an_sms_outlast_the_chain(): void
    {
        $retryAfter = min(
            (int) config('queue.connections.database.retry_after'),
            (int) config('queue.connections.redis.retry_after'),
        );
        foreach ([CodedNotification::class, SendDeferredSmsJob::class] as $class) {
            $timeout = (new \ReflectionClass($class))->getProperty('timeout')->getDefaultValue();
            $this->assertIsInt($timeout, $class);
            $this->assertGreaterThan(self::BUDGET + 10, $timeout, $class);
            $this->assertLessThan($retryAfter, $timeout, $class);
        }
    }
}
