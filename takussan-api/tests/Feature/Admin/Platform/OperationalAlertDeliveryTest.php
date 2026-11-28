<?php

namespace Tests\Feature\Admin\Platform;

use App\Jobs\RecordQueueHeartbeat;
use App\Jobs\SendAdminAlert;
use App\Models\AlertRule;
use App\Services\Admin\HealthcheckService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-679 (P14.01) — une alerte d'exploitation `ops_*` part de façon synchrone, depuis le
 * scheduler qui l'évalue : mise sur la file `default`, l'alerte « file à l'arrêt » attendait le
 * worker même dont elle annonçait la panne.
 *
 * La connexion de file est ici `database`, comme en production : sous `sync` (celle de
 * `phpunit.xml`), tout job s'exécute sur-le-champ et le défaut ne se voit pas.
 */
class OperationalAlertDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private const SLACK = 'https://hooks.slack.com/services/T/B/x';

    private const DISCORD = 'https://discord.com/api/webhooks/1/x';

    protected function setUp(): void
    {
        parent::setUp();
        config(['queue.default' => 'database']);
    }

    public function test_l_alerte_file_a_l_arret_part_sans_passer_par_la_file(): void
    {
        Http::fake(['*' => Http::response('ok')]);
        $regle = $this->regle('ops_queue_stalled', self::SLACK);
        $this->fileALArret();

        $this->artisan('alerts:evaluate')->assertSuccessful();

        Http::assertSent(fn (Request $r) => $r->url() === self::SLACK);
        $this->assertSame(0, $this->alertesEnFile());
        $this->assertNotNull($regle->refresh()->last_triggered_at);
    }

    /** Hors `ops_*`, rien ne change : l'alerte d'un geste d'administration reste en file. */
    public function test_une_alerte_hors_exploitation_reste_en_file(): void
    {
        Http::fake(['*' => Http::response('ok')]);
        $this->regle('super_admin_user_blocked', self::SLACK);

        activity('Admin')->event('super_admin_user_blocked')->log('super_admin_user_blocked');

        Http::assertNothingSent();
        $this->assertSame(1, $this->alertesEnFile());
    }

    /**
     * Synchrone, une livraison en échec ne doit ni faire tomber `alerts:evaluate`, ni priver les
     * autres règles de l'événement de la leur. L'échec reste compté sur sa règle.
     */
    public function test_une_regle_en_echec_n_empeche_ni_les_autres_ni_l_evaluation(): void
    {
        Http::fake([
            'hooks.slack.com/*' => Http::response('down', 500),
            'discord.com/*' => Http::response('ok'),
        ]);
        $enEchec = $this->regle('ops_queue_stalled', self::SLACK);
        $saine = $this->regle('ops_queue_stalled', self::DISCORD, 'discord');
        $this->fileALArret();

        $this->artisan('alerts:evaluate')->assertSuccessful();

        Http::assertSent(fn (Request $r) => $r->url() === self::DISCORD);
        $this->assertSame(1, $enEchec->refresh()->failure_count);
        $this->assertNull($enEchec->last_triggered_at);
        $this->assertNotNull($saine->refresh()->last_triggered_at);
        $this->assertSame(1, DB::table('activity_log')->where('event', 'ops_health_degraded')->count());
    }

    /**
     * TCK-3018 — `webhooks` est une liste d'URL sans fournisseur, et Slack et Discord n'acceptent pas le
     * même corps : chaque URL reçoit UNE fois celui que son hôte accepte. Un corps Slack sur Discord rend
     * 400, et `->throw()` faisait échouer le job à chaque fois.
     */
    public function test_chaque_webhook_recoit_le_corps_de_son_fournisseur(): void
    {
        Http::fake(['*' => Http::response('ok')]);
        $regle = AlertRule::create([
            'event' => 'ops_queue_stalled',
            'channels_json' => ['slack', 'discord'],
            'recipients_json' => ['webhooks' => [self::SLACK, self::DISCORD]],
            'is_active' => true,
        ]);

        (new SendAdminAlert($regle->id, ['message' => 'File à l\'arrêt', 'audit_url' => 'https://takussan.test/audit/1']))->handle();

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $r) => $r->url() === self::SLACK
            && $r['text'] === 'File à l\'arrêt'
            && $r['blocks'][1]['elements'][0]['text'] === 'https://takussan.test/audit/1'
            && ! isset($r['content']));
        Http::assertSent(fn (Request $r) => $r->url() === self::DISCORD
            && $r['content'] === "File à l'arrêt\nhttps://takussan.test/audit/1"
            && ! isset($r['text']));
    }

    /**
     * TCK-3018 — un hôte inconnu prend le seul canal actif de la règle ; deux canaux actifs, il est
     * sauté plutôt que deviné. Un hôte reconnu dont le canal n'est pas actif est sauté aussi.
     */
    public function test_un_hote_inconnu_prend_le_seul_canal_actif_et_rien_quand_ils_sont_deux(): void
    {
        Http::fake(['*' => Http::response('ok')]);
        $maison = 'https://alertes.agence.test/hook';
        $alerte = ['message' => 'Santé dégradée', 'audit_url' => 'https://takussan.test/audit/2'];
        $regle = fn (array $canaux, array $urls): int => AlertRule::create([
            'event' => 'ops_queue_stalled',
            'channels_json' => $canaux,
            'recipients_json' => ['webhooks' => $urls],
            'is_active' => true,
        ])->id;

        (new SendAdminAlert($regle(['discord'], [$maison, self::SLACK]), $alerte))->handle();
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $r) => $r->url() === $maison && isset($r['content']) && ! isset($r['blocks']));

        (new SendAdminAlert($regle(['slack', 'discord'], [$maison]), $alerte))->handle();
        Http::assertSentCount(1);
    }

    private function regle(string $event, string $url, string $canal = 'slack'): AlertRule
    {
        return AlertRule::create([
            'event' => $event,
            'channels_json' => [$canal],
            'recipients_json' => ['webhooks' => [$url]],
            'is_active' => true,
        ]);
    }

    /** Battements frais, puis un job de `default` en attente depuis 15 min. */
    private function fileALArret(): void
    {
        foreach (RecordQueueHeartbeat::QUEUES as $file) {
            (new RecordQueueHeartbeat($file))->handle();
        }
        $quand = now()->subMinutes(15)->getTimestamp();
        DB::table('jobs')->insert(['queue' => 'default', 'payload' => '{}', 'attempts' => 0, 'available_at' => $quand, 'created_at' => $quand]);
        Cache::forget(HealthcheckService::SNAPSHOT_KEY);
    }

    private function alertesEnFile(): int
    {
        return DB::table('jobs')->where('payload', 'like', '%SendAdminAlert%')->count();
    }
}
