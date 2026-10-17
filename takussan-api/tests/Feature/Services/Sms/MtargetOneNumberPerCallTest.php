<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Integration;
use App\Services\Notifications\Sms\Drivers\MtargetSmsDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * P27.05 (TCK-784) — un seul numéro par appel chez Mtarget.
 *
 * Le pilote lisait `results[0]` pour tout le lot : la réponse `[{code 0}, {code -3}]` à deux numéros
 * les donnait `sent` tous les deux. Le format réel d'une réponse à plusieurs numéros n'étant pas
 * vérifié, chaque numéro part par son propre appel, et chaque résultat est le sien.
 */
class MtargetOneNumberPerCallTest extends TestCase
{
    use RefreshDatabase;

    public function test_chaque_numero_part_par_son_propre_appel_et_porte_son_propre_resultat(): void
    {
        config()->set('sms.mtarget.send_url', 'https://api-public.mtarget.fr/messages');
        Integration::create([
            'provider' => 'sms_mtarget',
            'agency_id' => null,
            'credentials' => ['username' => 'mtg-user', 'password' => 'mtg-pass'],
            'is_active' => true,
        ]);
        Http::fake(function (Request $request) {
            $code = $request['msisdn'] === '221771111111' ? 0 : -3;

            return Http::response(['results' => [['code' => $code, 'ticket' => 'T'.$request['msisdn']]]]);
        });

        $results = app(MtargetSmsDriver::class)->send(['+221771111111', '+221772222222'], 'Bonjour');

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $r) => $r['msisdn'] === '221771111111');
        Http::assertSent(fn (Request $r) => $r['msisdn'] === '221772222222');
        $this->assertTrue($results['+221771111111']->isTerminalSuccess());
        $this->assertSame('T221771111111|+221771111111', $results['+221771111111']->providerMessageId);
        $this->assertFalse($results['+221772222222']->isTerminalSuccess());
        $this->assertSame('mtarget_error_-3', $results['+221772222222']->failureReason);
    }
}
