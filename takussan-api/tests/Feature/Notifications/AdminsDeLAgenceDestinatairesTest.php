<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Lead\ContactLeadService;
use App\Services\Property\PropertyModerationNotifier;
use App\Services\Review\ReviewNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-1318 (P126.05) — les listes d'admins destinataires d'une agence passent par une seule
 * méthode : admins au profil actif ET au compte joignable. Un admin actif au compte bloqué n'est
 * dans aucune. Les trois autres listes (KYC, gouvernance, proposition de bien) sont gardées dans
 * leur propre classe de test.
 */
class AdminsDeLAgenceDestinatairesTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $actif;

    private User $bloque;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create();
        $this->actif = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $this->actif->id, 'agency_id' => $this->agency->id]);
        $this->bloque = User::factory()->create(['status' => UserStatus::Blocked]);
        AgencyAdminProfile::factory()->create(['user_id' => $this->bloque->id, 'agency_id' => $this->agency->id]);
    }

    public function test_contact_lead_service_lists_the_active_admin_and_not_the_blocked_one(): void
    {
        $ids = app(ContactLeadService::class)->agencyAdmins($this->agency->id)->pluck('id')->all();

        $this->assertSame([$this->actif->id], $ids);
    }

    public function test_a_review_of_the_agency_reaches_the_active_admin_and_not_the_blocked_one(): void
    {
        app(ReviewNotifier::class)->received(Review::factory()->create([
            'reviewable_type' => $this->agency->getMorphClass(),
            'reviewable_id' => $this->agency->id,
        ]));

        $this->assertReached(NotificationCode::ReviewReceived);
    }

    public function test_a_property_awaiting_moderation_reaches_the_active_admin_and_not_the_blocked_one(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);

        app(PropertyModerationNotifier::class)->submitted($property, null);

        $this->assertReached(NotificationCode::PropertySubmittedForReview);
    }

    private function assertReached(NotificationCode $code): void
    {
        $match = fn (CodedNotification $n) => $n->code === $code;
        Notification::assertSentTo($this->actif, CodedNotification::class, $match);
        Notification::assertNotSentTo($this->bloque, CodedNotification::class, $match);
    }
}
