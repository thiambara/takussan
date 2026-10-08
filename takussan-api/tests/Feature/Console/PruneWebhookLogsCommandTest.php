<?php

namespace Tests\Feature\Console;

use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §6, AC8) — la rétention appartient à `webhooks:prune`, planifiée, par canal :
 * 90 jours pour les paiements, 30 pour la messagerie. Une lecture de la console ne purge rien.
 */
class PruneWebhookLogsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_prune_applies_the_retention_of_each_channel(): void
    {
        $payment91 = $this->logAged('payment', 91);
        $payment89 = $this->logAged('payment', 89);
        $sms31 = $this->logAged('sms', 31);
        $sms29 = $this->logAged('sms', 29);
        $whatsapp31 = $this->logAged('whatsapp', 31);

        $this->artisan('webhooks:prune')->assertSuccessful();

        $this->assertModelMissing($payment91);
        $this->assertModelExists($payment89);
        $this->assertModelMissing($sms31);
        $this->assertModelExists($sms29);
        $this->assertModelMissing($whatsapp31);
    }

    /** AC8 — lire la piste d'une intégration ne supprime aucune ligne de 31 jours. */
    public function test_reading_the_console_trail_prunes_nothing(): void
    {
        $integration = Integration::factory()->create(['provider' => 'wave', 'agency_id' => null]);
        $old = $this->logAged('payment', 31, ['integration_id' => $integration->id]);
        $oldSms = $this->logAged('sms', 31);

        $this->actingAsRole('super_admin');
        $this->getJson("/api/admin/integrations/{$integration->id}/webhooks")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/admin/webhook-logs')->assertOk();

        $this->assertModelExists($old);
        $this->assertModelExists($oldSms);
    }

    public function test_the_command_is_scheduled_daily_without_overlapping(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => str_contains((string) $e->command, 'webhooks:prune'));

        $this->assertNotNull($event, 'webhooks:prune doit être planifiée.');
        $this->assertSame('45 3 * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    /** @param  array<string, mixed>  $attributes */
    private function logAged(string $channel, int $days, array $attributes = []): IntegrationWebhookLog
    {
        $log = IntegrationWebhookLog::query()->create($attributes + [
            'channel' => $channel,
            'provider' => $channel === 'payment' ? 'wave' : 'orange',
            'direction' => 'incoming',
            'status' => 'processed',
            'payload' => [],
        ]);
        $log->forceFill(['created_at' => now()->subDays($days), 'updated_at' => now()->subDays($days)])->save();

        return $log;
    }
}
