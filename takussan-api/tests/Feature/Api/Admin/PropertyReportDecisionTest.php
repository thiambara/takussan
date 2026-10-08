<?php

namespace Tests\Feature\Api\Admin;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §4, AC3, AC4, AC5) — trancher un signalement AGIT sur l'annonce, et le verrou
 * plateforme tient contre tous les chemins de republication.
 *
 * Avant : `resolveReport()` posait `resolved_at` et rien d'autre — « masquer » laissait l'annonce
 * publiée et indexée ; `hide`/`remove` sur un bien en attente tombaient dans `reject`.
 */
class PropertyReportDecisionTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    private User $super;

    private User $adminA;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->owner = User::factory()->create();
        $this->materializeRoleProfile($this->owner, 'agent', $this->agency);
        $this->adminA = User::factory()->create();
        $this->materializeRoleProfile($this->adminA, 'agency_admin', $this->agency);
        $this->super = User::factory()->create();
        $this->materializeRoleProfile($this->super, 'super_admin');

        $this->property = Property::factory()->published()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->owner->id,
            'is_test' => false,
        ]);
    }

    private function report(?User $reporter, ?string $fingerprint = null): PropertyReport
    {
        return PropertyReport::create([
            'property_id' => $this->property->id,
            'reporter_user_id' => $reporter?->id,
            'reporter_fingerprint' => $fingerprint,
            'reason' => 'fraud',
            'details' => 'Annonce douteuse.',
        ]);
    }

    private function decide(PropertyReport $report, string $decision, string $code = 'fraud'): TestResponse
    {
        $this->actingAsApi($this->super);

        return $this->postJson("/api/admin/moderation/property_report:{$report->id}/decide", [
            'decision' => $decision,
            'reason_code' => $code,
        ]);
    }

    private function assertPubliclyVisible(bool $visible): void
    {
        $this->app['auth']->forgetGuards();
        $ids = collect($this->getJson('/api/public/properties?per_page=100')->assertOk()->json('data'))->pluck('id');
        $this->assertSame($visible, $ids->contains($this->property->id), 'liste publique');
        $this->getJson("/api/public/properties/{$this->property->slug}")->assertStatus($visible ? 200 : 404);
    }

    // ─── AC3 : hide ─────────────────────────────────────────────────────────────────────

    public function test_hide_takes_the_listing_offline_closes_every_report_and_notifies(): void
    {
        Notification::fake();
        $this->assertPubliclyVisible(true);

        $reporter = User::factory()->create();
        $first = $this->report($reporter);
        $anonymous = $this->report(null, str_repeat('a', 64));

        $this->decide($first, 'hide')->assertOk();

        $property = $this->property->refresh();
        $this->assertSame(PropertyStatus::Rejected, $property->status);
        $this->assertSame(PropertyVisibility::Private, $property->visibility);
        $this->assertNull($property->published_at);
        $this->assertNotNull($property->platform_hold_at);
        $this->assertSame($this->super->id, $property->platform_hold_by_id);
        $this->assertSame('fraud', $property->platform_hold_reason);
        $this->assertFalse($property->shouldBeSearchable());
        $this->assertPubliclyVisible(false);

        foreach ([$first, $anonymous] as $report) {
            $report->refresh();
            $this->assertNotNull($report->resolved_at);
            $this->assertSame('hide', $report->decision);
            $this->assertSame($this->super->id, $report->resolved_by_id);
            $this->assertSame('fraud', $report->reason_code);
        }

        Notification::assertSentTo($this->owner, CodedNotification::class,
            fn (CodedNotification $n) => $n->code === NotificationCode::ModerationPropertyHidden);
        Notification::assertSentTo($reporter, CodedNotification::class,
            fn (CodedNotification $n) => $n->code === NotificationCode::ModerationReportUpheld);
        Notification::assertCount(2);
    }

    /** Le second chemin : chaque voie de republication bute sur le verrou. */
    public function test_the_agency_cannot_put_a_hidden_listing_back_online_by_any_path(): void
    {
        Notification::fake();
        $this->decide($this->report(null, str_repeat('b', 64)), 'hide')->assertOk();

        $this->actingAsApi($this->adminA);
        $id = $this->property->id;

        $this->postJson("/api/properties/{$id}/publish")->assertStatus(422)->assertJsonPath('code', 'moderation.platform_hold');
        $this->putJson("/api/properties/{$id}/status", ['status' => 'available'])->assertStatus(422)->assertJsonPath('code', 'moderation.platform_hold');
        $this->putJson("/api/properties/{$id}/visibility", ['visibility' => 'public'])->assertStatus(422)->assertJsonPath('code', 'moderation.platform_hold');
        $this->putJson("/api/properties/{$id}", ['status' => 'available'])->assertStatus(422);

        // Direct, sans HTTP : `update()`, `fill()->save()`, et lever le verrou à la main.
        $model = Property::findOrFail($id);
        $this->assertThrowsHold(fn () => $model->update(['status' => PropertyStatus::Available]));
        $model = Property::findOrFail($id);
        $this->assertThrowsHold(fn () => $model->fill(['visibility' => PropertyVisibility::Public])->save());
        $model = Property::findOrFail($id);
        $this->assertThrowsHold(fn () => $model->forceFill(['platform_hold_at' => null])->save());

        // L'archivage en lot ne lève pas le verrou.
        $this->postJson('/api/properties/bulk-archive', ['property_ids' => [$id]])->assertOk();
        $this->assertNotNull($this->property->refresh()->platform_hold_at);

        // L'admin d'agence resoumet, mais n'approuve pas un bien verrouillé.
        $this->property->forceFill(['status' => PropertyStatus::Rejected])->saveQuietly();
        $this->postJson("/api/properties/{$id}/resubmit")->assertOk();
        $this->postJson("/api/properties/{$id}/approve")->assertForbidden();

        $property = $this->property->refresh();
        $this->assertSame(PropertyStatus::PendingReview, $property->status);
        $this->assertNotNull($property->platform_hold_at);
        $this->assertPubliclyVisible(false);
    }

    private function assertThrowsHold(callable $callback): void
    {
        try {
            $callback();
            $this->fail('Le verrou plateforme aurait dû refuser la sauvegarde.');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->assertNotNull(Property::findOrFail($this->property->id)->platform_hold_at);
    }

    // ─── AC4 : remove, reject, couples invalides ────────────────────────────────────────

    public function test_remove_soft_deletes_the_listing(): void
    {
        Notification::fake();
        $report = $this->report(User::factory()->create());

        $this->decide($report, 'remove', 'other')->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->decide($report, 'remove')->assertOk();

        $property = Property::withTrashed()->findOrFail($this->property->id);
        $this->assertTrue($property->trashed());
        $this->assertNotNull($property->platform_hold_at);
        $this->assertSame('remove', $report->refresh()->decision);
        $this->assertPubliclyVisible(false);
        Notification::assertSentTo($this->owner, CodedNotification::class,
            fn (CodedNotification $n) => $n->code === NotificationCode::ModerationPropertyRemoved);
    }

    public function test_reject_closes_only_that_report_and_leaves_the_listing_unchanged(): void
    {
        Notification::fake();
        $reporter = User::factory()->create();
        $dismissed = $this->report($reporter);
        $other = $this->report(User::factory()->create());

        $this->decide($dismissed, 'reject', 'off_topic')->assertOk();

        $property = $this->property->refresh();
        $this->assertSame(PropertyStatus::Available, $property->status);
        $this->assertNull($property->platform_hold_at);
        $this->assertSame('reject', $dismissed->refresh()->decision);
        $this->assertNull($other->refresh()->resolved_at);
        $this->assertPubliclyVisible(true);

        Notification::assertSentTo($reporter, CodedNotification::class,
            fn (CodedNotification $n) => $n->code === NotificationCode::ModerationReportDismissed);
        Notification::assertNotSentTo($this->owner, CodedNotification::class);
    }

    public function test_decisions_are_validated_per_item_type(): void
    {
        $report = $this->report(null, str_repeat('c', 64));
        $pending = Property::factory()->create([
            'agency_id' => $this->agency->id,
            'status' => PropertyStatus::PendingReview,
            'submitted_at' => now(),
        ]);

        $this->decide($report, 'approve')->assertStatus(422)->assertJsonPath('code', 'moderation.decision_invalid_for_type');
        $this->assertNull($report->refresh()->resolved_at);

        $this->actingAsApi($this->super);
        foreach (['hide', 'remove'] as $decision) {
            $this->postJson("/api/admin/moderation/property:{$pending->id}/decide", ['decision' => $decision, 'reason_code' => 'spam'])
                ->assertStatus(422)
                ->assertJsonPath('code', 'moderation.decision_invalid_for_type');
        }
        $this->assertSame(PropertyStatus::PendingReview, $pending->refresh()->status);
    }

    // ─── AC5 : seul un super-admin lève le verrou ───────────────────────────────────────

    public function test_only_a_super_admin_approval_lifts_the_hold_and_the_listing_becomes_publishable(): void
    {
        Notification::fake();
        $this->decide($this->report(null, str_repeat('d', 64)), 'hide')->assertOk();
        $id = $this->property->id;

        $this->actingAsApi($this->adminA);
        $this->postJson("/api/properties/{$id}/resubmit")->assertOk();
        $this->postJson("/api/properties/{$id}/approve")->assertForbidden();
        $this->assertNotNull($this->property->refresh()->platform_hold_at);

        $this->actingAsApi($this->super);
        $this->postJson("/api/properties/{$id}/approve")->assertOk();

        $property = $this->property->refresh();
        $this->assertSame(PropertyStatus::Available, $property->status);
        $this->assertNull($property->platform_hold_at);
        $this->assertNull($property->platform_hold_by_id);

        $this->actingAsApi($this->adminA);
        $this->postJson("/api/properties/{$id}/publish")->assertOk();
        $this->assertPubliclyVisible(true);
    }
}
