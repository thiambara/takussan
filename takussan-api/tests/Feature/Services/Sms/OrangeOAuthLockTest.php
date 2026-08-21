<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Agency;
use App\Models\Integration;
use App\Services\Notifications\Sms\OrangeOAuthTokenCache;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-110 — Single-flight OAuth refresh. Even if N parallel queue
 * workers wake up at the same minute and all observe an empty cache,
 * only ONE call to `/oauth/v3/token` should be made — the rest must
 * read the freshly cached token under the per-integration lock.
 */
class OrangeOAuthLockTest extends TestCase
{
    use RefreshDatabase;

    public function test_concurrent_sends_with_empty_cache_call_orange_oauth_only_once(): void
    {
        $agency = Agency::factory()->create();
        Integration::create([
            'provider' => 'sms_orange',
            'agency_id' => $agency->id,
            'credentials' => [
                'client_id' => 'cid',
                'client_secret' => 'csec',
                'sender_address' => 'tel:+221771111111',
            ],
            'metadata' => [],
            'is_active' => true,
        ]);

        // Force the cache to be empty *before each send*: simulates a
        // simultaneous TTL expiry across N workers. Without the
        // single-flight lock, each worker would race to refresh.
        $cache = $this->app->make(OrangeOAuthTokenCache::class);

        Http::fake([
            'api.orange.com/oauth/*' => Http::response([
                'access_token' => 'fresh-tok',
                'token_type' => 'Bearer',
                'expires_in' => 3600,
            ]),
            'api.orange.com/smsmessaging/*' => Http::response([
                'outboundSMSMessageRequest' => [
                    'resourceURL' => 'https://api.orange.com/r/abc',
                ],
            ], 201),
        ]);

        $router = $this->app->make(SmsRouterDriver::class);

        // 10 distinct MSISDNs (Orange) so the 3/day/MSISDN cap doesn't
        // gate the test. They share an empty OAuth cache → the
        // single-flight lock must collapse into ONE
        // `/oauth/v3/token` call for the whole burst.
        $cache->forget(1);
        $numbers = [];
        for ($i = 0; $i < 10; $i++) {
            $numbers[] = '+22177123456'.$i;
        }
        foreach ($numbers as $n) {
            $router->send($n, 'hello', [
                'agency_id' => $agency->id,
                'is_critical' => true,
            ]);
        }

        // Exactly 1 call to /oauth/v3/token + 10 sends.
        Http::assertSentCount(11);
        $oauthCalls = 0;
        Http::recorded(function ($request) use (&$oauthCalls): bool {
            if (str_contains((string) $request->url(), '/oauth/v3/token')) {
                $oauthCalls++;
            }

            return false;
        });
        $this->assertSame(1, $oauthCalls, 'OAuth must be called only once across 10 sends');
    }

    public function test_401_retry_reads_cache_instead_of_re_calling_oauth(): void
    {
        $agency = Agency::factory()->create();
        Integration::create([
            'provider' => 'sms_orange',
            'agency_id' => $agency->id,
            'credentials' => [
                'client_id' => 'cid',
                'client_secret' => 'csec',
                'sender_address' => 'tel:+221771111111',
            ],
            'metadata' => [],
            'is_active' => true,
        ]);

        // Pre-seed a cached token. The first send will use it, get a
        // 401, and trigger the refresh-if-stale path. We pre-populate
        // a *new* token in the cache to simulate a peer worker having
        // already refreshed; the 401 path must adopt that token rather
        // than calling OAuth again.
        // ⚠ `{$agency->id}` et non le littéral `1` — c'est un défaut que seule PostgreSQL
        // pouvait révéler. `nextval()` n'est PAS transactionnel : le `ROLLBACK` de
        // `RefreshDatabase` en fin de test rend les lignes, jamais les numéros. Le second
        // test de cette classe voyait donc une agence d'identifiant 2, quand la clé de
        // cache restait figée sur 1 — le jeton pré-posé n'était plus jamais lu, et
        // l'assertion « zéro appel OAuth » comptait 2 appels.
        //
        // Sous SQLite `:memory:`, le compteur de rowid repart de `max(rowid)+1` sur une
        // table vidée : l'identifiant valait 1 à chaque test, et le littéral marchait par
        // coïncidence. *Un identifiant écrit en dur dans un test n'affirme pas une valeur,
        // il affirme une propriété du moteur.*
        Cache::put("sms:orange:oauth_token:{$agency->id}", 'old-tok', 3600);

        $sendCalls = 0;
        Http::fake([
            'api.orange.com/oauth/*' => Http::response([
                'access_token' => 'never-called',
                'expires_in' => 3600,
            ]),
            'api.orange.com/smsmessaging/*' => function () use (&$sendCalls) {
                $sendCalls++;
                if ($sendCalls === 1) {
                    // Peer worker refreshed mid-flight → swap cached token.
                    Cache::put("sms:orange:oauth_token:{$agency->id}", 'peer-refreshed', 3600);

                    return Http::response(['error' => 'unauthorized'], 401);
                }

                return Http::response([
                    'outboundSMSMessageRequest' => [
                        'resourceURL' => 'https://api.orange.com/r/x',
                    ],
                ], 201);
            },
        ]);

        $router = $this->app->make(SmsRouterDriver::class);
        $router->send('+221771234567', 'hello', [
            'agency_id' => $agency->id,
            'is_critical' => true,
        ]);

        // Initial send (401) + retry (201). Zero OAuth calls — the
        // 401 path picked up the peer-refreshed token directly.
        $oauthCalls = 0;
        Http::recorded(function ($request) use (&$oauthCalls): bool {
            if (str_contains((string) $request->url(), '/oauth/v3/token')) {
                $oauthCalls++;
            }

            return false;
        });
        $this->assertSame(0, $oauthCalls);
    }
}
