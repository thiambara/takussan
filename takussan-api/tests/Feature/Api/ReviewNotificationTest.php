<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Review\ReviewNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §6, AC7) — un avis prévient : l'admin qui doit le modérer à sa création, le
 * sujet quand il est publié. Le libellé vient d'une clé, dans la langue du destinataire.
 */
class ReviewNotificationTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $publisher;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create(['preferred_language' => 'fr']);
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
        $this->publisher = User::factory()->create(['preferred_language' => 'fr']);
        $this->materializeRoleProfile($this->publisher, 'agent', $this->agency);
        $this->property = Property::factory()->published()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->publisher->id,
            'title' => 'Villa Almadies',
        ]);
    }

    public function test_a_new_property_review_notifies_the_agency_admins_to_moderate(): void
    {
        $suspended = User::factory()->create();
        $this->materializeRoleProfile($suspended, 'agency_admin', $this->agency);
        AgencyAdminProfile::query()->where('user_id', $suspended->id)->update(['status' => 'suspended']);

        $author = User::factory()->create();
        Booking::factory()->create([
            'property_id' => $this->property->id,
            'customer_id' => Customer::factory()->create(['user_id' => $author->id])->id,
            'status' => BookingStatus::Completed,
        ]);

        $this->actingAsApi($author);
        $this->postJson("/api/properties/{$this->property->id}/reviews", [
            'rating' => 4, 'title' => 'Bien', 'content' => 'Très bien situé.',
        ])->assertCreated();

        Notification::assertSentTo($this->admin, CodedNotification::class,
            fn (CodedNotification $n) => $n->code === NotificationCode::ReviewToModerate && $n->params['subject'] === 'Villa Almadies');
        Notification::assertNotSentTo($suspended, CodedNotification::class);
        Notification::assertNotSentTo($this->publisher, CodedNotification::class);

        $review = Review::query()->latest('id')->firstOrFail();
        $this->assertSame(64, strlen((string) $review->metadata['ip_hash']));
    }

    public function test_approval_notifies_the_publisher_with_a_translated_label(): void
    {
        $review = Review::factory()->create([
            'reviewable_type' => Property::class, 'reviewable_id' => $this->property->id,
            'rating' => 5, 'status' => ReviewStatus::Pending, 'is_approved' => false,
        ]);

        $this->actingAsApi($this->admin);
        $this->postJson("/api/reviews/{$review->id}/approve")->assertOk();

        Notification::assertSentTo($this->publisher, CodedNotification::class,
            fn (CodedNotification $n) => $n->code === NotificationCode::ReviewReceived && $n->params['rating'] === 5);
        Notification::assertNotSentTo($review->author, CodedNotification::class);

        $stored = AppNotification::query()->where('user_id', $this->publisher->id)->where('code', 'review.received')->firstOrFail();
        $this->assertSame('Nouvel avis : Villa Almadies', $stored->title);

        $renderer = app(NotificationRenderer::class);
        $this->assertSame(
            'New review: Villa Almadies',
            $renderer->render(NotificationCode::ReviewReceived, $stored->params, 'en', 'UTC', 'title', null),
        );
    }

    /**
     * verif-597 m4 — « Nouvel avis » part à la première publication, pas à chaque réapprobation.
     * Avant : signalement puis réapprobation, trois fois, et le publieur recevait quatre
     * notifications pour un seul avis.
     */
    public function test_reapproving_after_a_report_does_not_notify_the_subject_again(): void
    {
        $review = Review::factory()->create([
            'reviewable_type' => Property::class, 'reviewable_id' => $this->property->id,
            'rating' => 4, 'status' => ReviewStatus::Pending, 'is_approved' => false,
        ]);
        $super = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($super, 'super_admin');

        $this->actingAsApi($this->admin);
        $this->postJson("/api/reviews/{$review->id}/approve")->assertOk();
        foreach (range(1, 3) as $round) {
            $this->app['auth']->forgetGuards();
            $this->actingAsApi(User::factory()->create());
            $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'spam'])->assertOk();
            $this->assertSame(ReviewStatus::Reported, $review->refresh()->status);

            $this->app['auth']->forgetGuards();
            $this->actingAsApi($super);
            $this->postJson("/api/reviews/{$review->id}/approve")->assertOk();
        }

        $received = Notification::sent($this->publisher, CodedNotification::class)
            ->filter(fn (CodedNotification $n) => $n->code === NotificationCode::ReviewReceived);
        $this->assertCount(1, $received);
    }

    public function test_an_agency_review_notifies_no_admin_at_creation_and_its_admins_at_approval(): void
    {
        $review = Review::factory()->create([
            'reviewable_type' => Agency::class, 'reviewable_id' => $this->agency->id,
            'status' => ReviewStatus::Pending, 'is_approved' => false,
        ]);
        app(ReviewNotifier::class)->toModerate($review);
        Notification::assertNothingSent();

        $super = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $this->actingAsApi($super);
        $this->postJson("/api/reviews/{$review->id}/approve")->assertOk();

        Notification::assertSentTo($this->admin, CodedNotification::class,
            fn (CodedNotification $n) => $n->code === NotificationCode::ReviewReceived);
    }
}
