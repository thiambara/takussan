<?php

namespace Tests\Feature\Notifications;

use App\Jobs\UpdateWhatsappDeliveryStatusJob;
use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\JournalCapture;
use Tests\TestCase;

/**
 * TCK-1091 (P72.05) — un accusé `failed` reçu après coup s'écrit au journal : fournisseur, motif,
 * identifiant de tentative, jamais le numéro. Avant, ni `DeliveryAttemptUpdater` ni le job
 * WhatsApp n'écrivaient rien : l'échec ne se lisait nulle part.
 */
class LateDeliveryFailureLogTest extends TestCase
{
    use JournalCapture;
    use RefreshDatabase;

    private const MESSAGE = '[delivery] accusé failed reçu après coup';

    protected function setUp(): void
    {
        parent::setUp();
        $this->captureJournal();
    }

    private function tentative(string $fournisseur, string $idMessage): NotificationDeliveryAttempt
    {
        $notification = AppNotification::factory()->create(['user_id' => User::factory()->create()->id]);

        return NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => $fournisseur,
            'provider_message_id' => $idMessage,
            'to' => '+221770001122',
            'status' => 'sent',
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function avertissements(): array
    {
        return array_map(
            fn (array $e): array => $e['context'],
            array_values(array_filter($this->entreesJournal(self::MESSAGE), fn (array $e): bool => $e['level'] === 'warning')),
        );
    }

    public function test_un_failed_sms_tardif_s_ecrit_une_fois_au_journal_sans_le_numero(): void
    {
        $tentative = $this->tentative('mtarget', 'mtg-1');
        $updater = app(DeliveryAttemptUpdater::class);

        foreach ([1, 2] as $_) {
            $updater->applyStatus('mtarget', 'mtg-1', 'failed', failureReason: 'UNDELIV',
                statusPrecedence: DeliveryAttemptUpdater::SMS_STATUS_PRECEDENCE);
        }

        $vus = $this->avertissements();
        $this->assertCount(1, $vus, 'l\'accusé rejoué ne s\'écrit pas deux fois');
        $this->assertSame(['provider' => 'mtarget', 'failure_reason' => 'UNDELIV', 'attempt_id' => $tentative->id], $vus[0]);
        $this->assertStringNotContainsString('770001122', json_encode($vus));
    }

    public function test_un_failed_whatsapp_tardif_s_ecrit_au_journal(): void
    {
        $tentative = $this->tentative('whatsapp_cloud', 'wamid.X');

        (new UpdateWhatsappDeliveryStatusJob('wamid.X', 'failed', '131026: Message undeliverable'))->handle(app(DeliveryAttemptUpdater::class));

        $vus = $this->avertissements();
        $this->assertSame([['provider' => 'whatsapp_cloud', 'failure_reason' => '131026: Message undeliverable', 'attempt_id' => $tentative->id]], $vus);
    }

    public function test_un_accuse_delivered_ne_s_ecrit_pas(): void
    {
        $this->tentative('mtarget', 'mtg-2');

        app(DeliveryAttemptUpdater::class)->applyStatus('mtarget', 'mtg-2', 'delivered',
            statusPrecedence: DeliveryAttemptUpdater::SMS_STATUS_PRECEDENCE);

        $this->assertSame([], $this->avertissements());
    }
}
