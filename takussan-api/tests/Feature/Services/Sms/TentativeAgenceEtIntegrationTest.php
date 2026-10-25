<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Services\Notifications\Sms\OrangeDailyCapTracker;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-2326 (P203.05) — une tentative de remise garde l'agence de l'envoi et l'intégration que le
 * fournisseur a prise : `cost_estimate` sans eux ne dit pas qui paie le SMS. Les deux colonnes sont
 * nullables, et les lignes d'avant restent à `null`.
 */
class TentativeAgenceEtIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = '2026_10_25_120500_add_agency_and_integration_to_notification_delivery_attempts_table';

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        config()->set('sms.webhook_url_token', 'tck-2326-test-token');
    }

    private function integration(string $provider, ?int $agencyId): Integration
    {
        return Integration::create([
            'provider' => $provider,
            'agency_id' => $agencyId,
            'credentials' => ['accountid' => 'lam-acc', 'password' => 'p', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);
    }

    /** @return list<NotificationDeliveryAttempt> */
    private function envoyer(string $numero, AppNotification $notification): array
    {
        $this->app->make(SmsRouterDriver::class)->send($numero, 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
            'notification_id' => $notification->id,
        ]);

        return NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $notification->id)
            ->orderBy('attempt')
            ->get()
            ->all();
    }

    public function test_la_tentative_garde_l_agence_et_son_integration(): void
    {
        $integration = $this->integration('sms_lafricamobile', $this->agency->id);
        Http::fake(['lampush*' => Http::response(['push_id' => 'lam-1'], 200)]);

        [$tentative] = $this->envoyer('+221761234567', AppNotification::factory()->create());

        $this->assertSame('lafricamobile', $tentative->provider);
        $this->assertSame($this->agency->id, $tentative->agency_id);
        $this->assertSame($integration->id, $tentative->integration_id);
    }

    /** Une agence sans intégration propre prend celle de la plateforme : la tentative le dit. */
    public function test_le_repli_sur_la_plateforme_se_lit_sur_la_tentative(): void
    {
        $plateforme = $this->integration('sms_lafricamobile', null);
        Http::fake(['lampush*' => Http::response(['push_id' => 'lam-2'], 200)]);

        [$tentative] = $this->envoyer('+221761234567', AppNotification::factory()->create());

        $this->assertSame($this->agency->id, $tentative->agency_id);
        $this->assertSame($plateforme->id, $tentative->integration_id);
    }

    /** Orange au plafond n'est pas appelé : sa tentative n'a pas d'intégration, la suivante si. */
    public function test_un_fournisseur_non_appele_n_a_pas_d_integration(): void
    {
        $this->integration('sms_orange', $this->agency->id);
        $lam = $this->integration('sms_lafricamobile', $this->agency->id);
        $cap = $this->app->make(OrangeDailyCapTracker::class);
        foreach (range(1, 3) as $_) {
            $cap->increment('+221771234567');
        }
        Http::fake(['lampush*' => Http::response(['push_id' => 'lam-3'], 200)]);

        [$orange, $repli] = $this->envoyer('+221771234567', AppNotification::factory()->create());

        $this->assertSame('orange', $orange->provider);
        $this->assertSame($this->agency->id, $orange->agency_id);
        $this->assertNull($orange->integration_id);
        $this->assertSame($lam->id, $repli->integration_id);
    }

    public function test_le_report_de_nuit_garde_l_agence_sans_integration(): void
    {
        $this->integration('sms_lafricamobile', $this->agency->id);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-04-26 23:30:00', 'Africa/Dakar'));
        config()->set('sms.quiet_hours.enabled', true);
        Queue::fake();
        Http::fake();
        $notification = AppNotification::factory()->create();

        $this->app->make(SmsRouterDriver::class)->send('+221761234567', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => false,
            'notification_id' => $notification->id,
        ]);

        $tentative = NotificationDeliveryAttempt::query()->where('app_notification_id', $notification->id)->sole();
        $this->assertSame($this->agency->id, $tentative->agency_id);
        $this->assertNull($tentative->integration_id);
        CarbonImmutable::setTestNow();
    }

    /** Les lignes d'avant restent à `null` : rien ne les reconstitue. Le `down()` retire les deux colonnes. */
    public function test_la_migration_laisse_les_lignes_existantes_a_null_et_se_defait(): void
    {
        $migration = require database_path('migrations/'.self::MIGRATION.'.php');
        $migration->down();
        $this->assertFalse(Schema::hasColumn('notification_delivery_attempts', 'agency_id'));
        $this->assertFalse(Schema::hasColumn('notification_delivery_attempts', 'integration_id'));

        $id = DB::table('notification_delivery_attempts')->insertGetId([
            'app_notification_id' => null,
            'attempt' => 1,
            'provider' => 'lafricamobile',
            'status' => 'sent',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $migration->up();

        $ligne = DB::table('notification_delivery_attempts')->find($id);
        $this->assertNull($ligne->agency_id);
        $this->assertNull($ligne->integration_id);
    }
}
