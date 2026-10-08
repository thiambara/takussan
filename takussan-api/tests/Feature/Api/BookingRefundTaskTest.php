<?php

namespace Tests\Feature\Api;

use App\Jobs\Booking\ExpirePendingBookingsJob;
use App\Jobs\ExpireBookings;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\Task;
use App\Models\User;
use App\Services\Booking\BookingExpirationService;
use App\Services\Booking\BookingRefundTaskService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-596 (AC3, AC5) — un acompte `paid` sur une réservation fermée sans avoir eu lieu devient
 * UNE tâche « remboursement à traiter », par chacun des cinq chemins de fermeture : annulation,
 * refus, échéance propre, seuil de l'agence, `expire-now`. Le dernier remboursement la clôt.
 */
class BookingRefundTaskTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    /** @return Collection<int, Task> */
    private function refundTasks(Booking $booking)
    {
        return Task::query()
            ->where('taskable_type', $booking->getMorphClass())
            ->where('taskable_id', $booking->id)
            ->where('metadata->kind', 'booking_refund')
            ->get();
    }

    private function assertOneOpenTask(Booking $booking, User $assignee): Task
    {
        $tasks = $this->refundTasks($booking);
        $this->assertCount(1, $tasks);
        $task = $tasks->first();
        $this->assertSame($assignee->id, $task->assigned_to_id);
        $this->assertSame(TaskStatus::Open, $task->status);
        $this->assertSame(TaskPriority::High, $task->priority);

        return $task;
    }

    public function test_cancellation_with_a_paid_deposit_opens_one_task_assigned_to_the_property_agent(): void
    {
        $booking = $this->bookingOfClient();
        $payment = $this->paidDeposit($booking);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();

        $task = $this->assertOneOpenTask($booking, $this->agent);
        $this->assertSame([$payment->id], $task->metadata['booking_payment_ids']);
        $this->assertSame($this->client->id, $task->created_by_id);
    }

    public function test_rejection_with_a_paid_deposit_opens_one_task(): void
    {
        $booking = $this->bookingOfClient();
        $this->paidDeposit($booking);
        Sanctum::actingAs($this->landlord);

        $this->postJson("/api/bookings/{$booking->id}/reject")->assertOk();

        $this->assertOneOpenTask($booking, $this->agent);
    }

    public function test_expiry_at_its_own_deadline_opens_one_task(): void
    {
        $booking = $this->bookingOfClient(['expires_at' => now()->subHour()]);
        $this->paidDeposit($booking);

        (new ExpireBookings)->handle();

        $this->assertSame(BookingStatus::Expired, $booking->fresh()->status);
        $this->assertOneOpenTask($booking, $this->agent);
    }

    public function test_expiry_at_the_agency_threshold_opens_one_task(): void
    {
        $booking = $this->bookingOfClient(['expires_at' => now()->addDays(5)]);
        Booking::query()->whereKey($booking->id)->update(['created_at' => now()->subHours(72)]);
        $this->paidDeposit($booking);

        (new ExpirePendingBookingsJob)->handle(app(BookingExpirationService::class));

        $this->assertSame(BookingStatus::Expired, $booking->fresh()->status);
        $this->assertOneOpenTask($booking, $this->agent);
    }

    public function test_expire_now_opens_one_task(): void
    {
        $booking = $this->bookingOfClient();
        $this->paidDeposit($booking);
        $admin = $this->agencyAdmin($this->agency);
        Sanctum::actingAs($admin);

        $this->postJson("/api/bookings/{$booking->id}/expire-now")->assertOk();

        $task = $this->assertOneOpenTask($booking, $this->agent);
        $this->assertSame($admin->id, $task->created_by_id);
    }

    public function test_without_a_paid_payment_no_task_is_opened(): void
    {
        $booking = $this->bookingOfClient();
        $this->paidDeposit($booking, status: PaymentStatus::Pending);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();

        $this->assertCount(0, $this->refundTasks($booking));
    }

    public function test_opening_twice_never_creates_a_second_task(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Cancelled]);
        $this->paidDeposit($booking);
        $service = app(BookingRefundTaskService::class);

        $first = $service->openFor($booking);
        $second = $service->openFor($booking);

        $this->assertSame($first->id, $second->id);
        $this->assertCount(1, $this->refundTasks($booking));
    }

    public function test_the_last_refund_closes_the_task_and_refund_status_follows(): void
    {
        $booking = $this->bookingOfClient();
        $first = $this->paidDeposit($booking, 6_000);
        $second = $this->paidDeposit($booking, 4_000);
        Sanctum::actingAs($this->client);
        $this->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()
            ->assertJsonPath('data.refund_status', 'pending')
            ->assertJsonPath('data.booking_payments.0.id', $first->id)
            ->assertJsonPath('data.booking_payments.0.status', 'paid');

        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/booking-payments/{$first->id}/refund", ['refund_amount' => 6_000])->assertOk();
        $this->assertSame(TaskStatus::Open, $this->refundTasks($booking)->first()->status);

        $this->postJson("/api/booking-payments/{$second->id}/refund", ['refund_amount' => 4_000])->assertOk();
        $task = $this->refundTasks($booking)->first();
        $this->assertSame(TaskStatus::Done, $task->status);
        $this->assertNotNull($task->completed_at);

        Sanctum::actingAs($this->client);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('data.refund_status', 'refunded');
    }

    public function test_refund_status_is_null_while_the_booking_is_still_open(): void
    {
        $booking = $this->bookingOfClient();
        $this->paidDeposit($booking);
        Sanctum::actingAs($this->client);

        $this->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('data.refund_status', null);
    }

    /** Assignation : auteur du personnel, puis `manager` avant `agent`, puis admin, puis bailleur. */
    public function test_assignment_order(): void
    {
        $service = app(BookingRefundTaskService::class);

        $staffAuthor = $this->agencyAgent($this->agency);
        $this->assertSame($staffAuthor->id, $service->assigneeFor($this->bookingOfClient(['created_by_id' => $staffAuthor->id]))->id);

        $manager = $this->agencyAgent($this->agency);
        $this->collaborate($manager, CollaboratorRole::Manager);
        $this->assertSame($manager->id, $service->assigneeFor($this->bookingOfClient())->id);

        PropertyCollaborator::query()->where('property_id', $this->property->id)->delete();
        $admin = $this->agencyAdmin($this->agency);
        $this->assertSame($admin->id, $service->assigneeFor($this->bookingOfClient())->id);

        $host = User::factory()->create();
        $this->property = Property::factory()->published()->create(['user_id' => $host->id, 'agency_id' => null]);
        $this->assertSame($host->id, $service->assigneeFor($this->bookingOfClient(['agency_id' => null]))->id);
    }
}
