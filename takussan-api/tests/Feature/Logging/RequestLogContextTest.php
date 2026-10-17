<?php

namespace Tests\Feature\Logging;

use App\Models\Profiles\AgentProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\ApiTestCase;

/**
 * TCK-774 (P14.12) — un journal écrit pendant une requête de l'API porte `request_id`, l'agence et
 * le profil actifs : une erreur se relie à sa requête et à son agence.
 */
class RequestLogContextTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @var list<array<string, mixed>> */
    private array $contextes = [];

    protected function setUp(): void
    {
        parent::setUp();
        Route::middleware('api')->get('/api/_test/log-context', function () {
            Log::info('sonde');

            return response()->noContent();
        });
        Event::listen(MessageLogged::class, function (MessageLogged $e): void {
            if ($e->message === 'sonde') {
                $this->contextes[] = $e->context;
            }
        });
    }

    public function test_le_journal_porte_la_requete_l_agence_et_le_profil_actifs(): void
    {
        $user = $this->apiActingAsRole('agent');
        $agence = AgentProfile::query()->where('user_id', $user->id)->sole()->agency_id;

        $this->getJson('/api/_test/log-context')->assertNoContent();

        $this->assertCount(1, $this->contextes);
        $contexte = $this->contextes[0];
        $this->assertTrue(Str::isUuid($contexte['request_id'] ?? ''));
        $this->assertSame($agence, $contexte['agency_id']);
        // Le profil est celui que `ResolveActiveProfile` a choisi parmi ceux de l'utilisateur.
        $classe = 'App\\Models\\Profiles\\'.$contexte['profile_type'];
        $this->assertTrue($classe::query()->whereKey($contexte['profile_id'])->where('user_id', $user->id)->where('agency_id', $agence)->exists());
    }

    public function test_un_request_id_entrant_est_repris_s_il_est_sain(): void
    {
        $this->getJson('/api/_test/log-context', ['X-Request-Id' => 'abc-123_DEF.4'])->assertNoContent();
        $this->getJson('/api/_test/log-context', ['X-Request-Id' => str_repeat('x', 200)])->assertNoContent();

        $this->assertSame('abc-123_DEF.4', $this->contextes[0]['request_id']);
        $this->assertTrue(Str::isUuid($this->contextes[1]['request_id']));
        $this->assertNull($this->contextes[0]['agency_id']);
        $this->assertNull($this->contextes[0]['profile_id']);
    }
}
