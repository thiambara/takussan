<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\AppNotification;
use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-1350 (P88.04) — un compte bloqué ou supprimé ne reçoit plus les notifications métier : ni
 * cloche, ni e-mail, ni canal mobile. Seuls les codes du compte lui-même (blocage, réactivation)
 * l'atteignent encore.
 */
class CompteNonJoignableTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_un_compte_bloque_ne_recoit_aucun_code_metier(): void
    {
        foreach (['+221771234567' => UserStatus::Blocked, '+221771234568' => UserStatus::Deleted] as $phone => $status) {
            $user = User::factory()->create(['status' => $status, 'phone' => $phone, 'phone_verified_at' => now()]);

            $row = app(NotificationService::class)->send($user, NotificationCode::LeasePaymentDueSoon, [
                'amount' => NotificationRenderer::money(150000, 'XOF'),
                'due_date' => now()->addDays(3)->toDateString(),
                'property' => 'Villa',
            ]);

            $this->assertNull($row, $status->value);
            $this->assertSame(0, AppNotification::query()->where('user_id', $user->id)->count(), $status->value);
            Notification::assertNothingSentTo($user);
            // La notification elle-même, envoyée par un autre chemin, n'ouvre aucun canal.
            $this->assertSame([], (new CodedNotification(NotificationCode::LeasePaymentDueSoon, []))->via($user), $status->value);
        }
    }

    public function test_le_blocage_lui_est_encore_annonce(): void
    {
        $user = User::factory()->create(['status' => UserStatus::Blocked]);

        $row = app(NotificationService::class)->send($user, NotificationCode::AccountBlocked, ['reason' => 'fraude']);

        $this->assertNotNull($row);
        Notification::assertSentTo($user, CodedNotification::class, fn (CodedNotification $n, array $channels) => $n->code === NotificationCode::AccountBlocked && in_array('mail', $channels, true));
    }

    public function test_un_compte_actif_recoit_le_code_metier(): void
    {
        $user = User::factory()->create();

        app(NotificationService::class)->send($user, NotificationCode::LeasePaymentDueSoon, [
            'amount' => NotificationRenderer::money(150000, 'XOF'),
            'due_date' => now()->addDays(3)->toDateString(),
            'property' => 'Villa',
        ]);

        Notification::assertSentTo($user, CodedNotification::class);
    }
}
