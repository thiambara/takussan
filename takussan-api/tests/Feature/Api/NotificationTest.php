<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private function makeNotification(User $user, array $overrides = []): AppNotification
    {
        return AppNotification::create(array_merge([
            'user_id' => $user->id,
            'type' => NotificationType::System,
            'delivery_channel' => NotificationChannel::App,
            'title' => 'Test notification',
            'body' => 'Body content',
            'is_read' => false,
        ], $overrides));
    }

    public function test_user_can_list_own_notifications(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $this->makeNotification($user);
        $this->makeNotification($user);
        $this->makeNotification($other);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications')->assertOk();
        $this->assertEquals(2, $response->json('meta.total'));
    }

    public function test_unread_count_is_included_in_meta(): void
    {
        $user = User::factory()->create();
        $this->makeNotification($user, ['is_read' => false]);
        $this->makeNotification($user, ['is_read' => true, 'read_at' => now()]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications')->assertOk();
        $this->assertEquals(1, $response->json('meta.unread'));
    }

    public function test_user_can_mark_notification_as_read(): void
    {
        $user = User::factory()->create();
        $notification = $this->makeNotification($user);

        Sanctum::actingAs($user);

        $this->postJson("/api/notifications/{$notification->id}/read")
            ->assertOk();

        $this->assertTrue($notification->fresh()->is_read);
        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_user_can_mark_notification_as_unread(): void
    {
        $user = User::factory()->create();
        $notification = $this->makeNotification($user, [
            'is_read' => true,
            'read_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/notifications/{$notification->id}/unread")
            ->assertOk();

        $this->assertFalse($notification->fresh()->is_read);
        $this->assertNull($notification->fresh()->read_at);
    }

    public function test_user_cannot_mark_another_users_notification_as_read(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $notification = $this->makeNotification($owner);

        Sanctum::actingAs($other);

        $this->postJson("/api/notifications/{$notification->id}/read")
            ->assertForbidden();
    }

    public function test_user_cannot_mark_another_users_notification_as_unread(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $notification = $this->makeNotification($owner, [
            'is_read' => true,
            'read_at' => now(),
        ]);

        Sanctum::actingAs($other);

        $this->postJson("/api/notifications/{$notification->id}/unread")
            ->assertForbidden();
    }

    public function test_user_can_mark_all_as_read(): void
    {
        $user = User::factory()->create();
        $this->makeNotification($user);
        $this->makeNotification($user);

        Sanctum::actingAs($user);

        $this->postJson('/api/notifications/read-all')->assertOk();

        $unread = AppNotification::where('user_id', $user->id)->whereNull('read_at')->count();
        $this->assertEquals(0, $unread);
    }

    /** TCK-588, AC13 — `per_page` est plafonné : il rendait tout l'historique sur demande. */
    public function test_per_page_est_plafonne_a_50(): void
    {
        $user = User::factory()->create();
        AppNotification::factory()->count(55)->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications?per_page=1000')->assertOk();

        $this->assertCount(50, $response->json('data'));
        $this->assertSame(55, $response->json('meta.total'));
    }

    public function test_filter_unread_ne_rend_que_les_non_lues(): void
    {
        $user = User::factory()->create();
        $this->makeNotification($user, ['title' => 'lue', 'is_read' => true, 'read_at' => now()]);
        $unread = $this->makeNotification($user, ['title' => 'non lue']);
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications?filter[unread]=1')->assertOk();

        $this->assertSame([$unread->id], array_column($response->json('data'), 'id'));
    }

    public function test_chaque_element_porte_code_params_et_cible(): void
    {
        Notification::fake();
        $user = User::factory()->create(['preferred_language' => 'fr']);
        $params = ['amount' => NotificationRenderer::money(150000, 'XOF'), 'property' => 'Villa Almadies'];
        app(NotificationService::class)->send($user, NotificationCode::LeasePaymentRecorded, $params, NotificationTarget::of('lease', 42));
        Sanctum::actingAs($user);

        $item = $this->getJson('/api/notifications')->assertOk()->json('data.0');

        $this->assertSame('lease_payment.recorded', $item['code']);
        $this->assertEquals($params, $item['params']);
        $this->assertSame(['kind' => 'lease', 'id' => 42, 'path' => '/app/leases/42'], $item['target']);
    }

    public function test_une_ligne_ancienne_derive_sa_cible_de_ses_donnees(): void
    {
        $user = User::factory()->create();
        $this->makeNotification($user, ['type' => NotificationType::Booking, 'data' => ['booking_id' => 17]]);
        $this->makeNotification($user, ['title' => 'sans cible']);
        Sanctum::actingAs($user);

        $items = collect($this->getJson('/api/notifications')->assertOk()->json('data'))->keyBy('title');

        $this->assertNull($items['Test notification']['code']);
        $this->assertSame('/app/bookings/17', $items['Test notification']['target']['path']);
        $this->assertNull($items['sans cible']['target']);
    }

    public function test_endpoints_require_auth(): void
    {
        $this->getJson('/api/notifications')->assertUnauthorized();
        $this->postJson('/api/notifications/1/read')->assertUnauthorized();
        $this->postJson('/api/notifications/1/unread')->assertUnauthorized();
        $this->postJson('/api/notifications/read-all')->assertUnauthorized();
    }
}
