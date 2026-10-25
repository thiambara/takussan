<?php

namespace Tests\Feature\Notifications;

use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use App\Notifications\LeaseDepositRefundNotification;
use App\Services\Lease\DepositRefundService;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-821 (P23.05) — `app_notifications.data` ne range que les identifiants des pièces d'une
 * retenue sur caution. L'URL signée se calcule à la lecture, après l'autorisation du bail, et ne
 * vit que la durée courte de `PrivateMediaAccess` ; l'URL longue (7 jours) reste au seul courriel.
 */
class DepositRefundAttachmentLinksTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{User, Lease, User} */
    private function refundWithAPhoto(): array
    {
        $tenant = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $tenant->id]);
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'tenant_id' => $customer->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);
        $lease->addMedia(UploadedFile::fake()->image('degat.jpg'))->toMediaCollection('lease_deposit_refund');

        app(DepositRefundService::class)->refund($lease, $landlord, ['amount' => 300000, 'reason' => 'Réparations']);

        return [$tenant, $lease, $landlord];
    }

    public function test_the_stored_notification_holds_no_signed_url(): void
    {
        [$tenant, $lease] = $this->refundWithAPhoto();

        $row = AppNotification::query()->where('user_id', $tenant->id)->sole();
        $media = $lease->getFirstMedia('lease_deposit_refund');

        $this->assertStringNotContainsString('signature=', json_encode($row->data));
        $this->assertSame([['id' => $media->id, 'name' => $media->name]], $row->data['attachments']);
    }

    public function test_the_feed_signs_the_attachment_at_read_with_the_short_ttl(): void
    {
        [$tenant, $lease] = $this->refundWithAPhoto();
        $media = $lease->getFirstMedia('lease_deposit_refund');
        Sanctum::actingAs($tenant);

        $attachment = $this->getJson('/api/notifications')->assertOk()->json('data.0.data.attachments.0');

        $this->assertSame($media->id, $attachment['id']);
        $this->assertStringStartsWith(url("/api/media/{$media->id}/file?"), $attachment['url']);
        $this->assertTrue(URL::hasValidSignature(request()->create($attachment['url']), absolute: false));
        parse_str((string) parse_url($attachment['url'], PHP_URL_QUERY), $query);
        $this->assertEqualsWithDelta(
            now()->addMinutes(PrivateMediaAccess::SIGNED_ROUTE_TTL_MINUTES)->getTimestamp(),
            (int) $query['expires'],
            5,
        );
    }

    public function test_an_attachment_foreign_to_the_lease_is_not_signed(): void
    {
        [$tenant, $lease] = $this->refundWithAPhoto();
        $own = $lease->getFirstMedia('lease_deposit_refund');
        $foreign = Lease::factory()->create();
        $foreignMedia = $foreign->addMedia(UploadedFile::fake()->image('autre.jpg'))->toMediaCollection('lease_deposit_refund');

        $row = AppNotification::query()->where('user_id', $tenant->id)->sole();
        $row->forceFill(['data' => [...$row->data, 'attachments' => [
            ['id' => $own->id, 'name' => 'degat'],
            ['id' => $foreignMedia->id, 'name' => 'autre'],
        ]]])->save();
        Sanctum::actingAs($tenant);

        $attachments = $this->getJson('/api/notifications')->assertOk()->json('data.0.data.attachments');

        $this->assertStringContainsString('signature=', (string) ($attachments[0]['url'] ?? ''));
        $this->assertArrayHasKey('url', $attachments[1]);
        $this->assertNull($attachments[1]['url']);
    }

    public function test_the_mail_keeps_the_seven_day_link(): void
    {
        [$tenant, $lease] = $this->refundWithAPhoto();
        $notification = new LeaseDepositRefundNotification($lease, 300000, 200000, 'Réparations');

        $lines = implode("\n", $notification->toMail($tenant)->introLines);
        preg_match('#https?://\S+signature=\S+#', $lines, $m);

        $this->assertNotEmpty($m, 'le courriel porte le lien signé');
        parse_str((string) parse_url($m[0], PHP_URL_QUERY), $query);
        $this->assertEqualsWithDelta(
            now()->addDays(LeaseDepositRefundNotification::ATTACHMENT_LINK_TTL_DAYS)->getTimestamp(),
            (int) $query['expires'],
            5,
        );
    }
}
