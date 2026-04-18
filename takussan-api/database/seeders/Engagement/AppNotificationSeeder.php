<?php

namespace Database\Seeders\Engagement;

use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Seeder;

class AppNotificationSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $this->fromLeasePayments();
        $this->fromBookings();
        $this->fromMaintenance();
        $this->fromLeases();
        $this->fromVisits();
    }

    private function fromVisits(): void
    {
        PropertyVisit::query()->chunkById(200, function ($visits) {
            foreach ($visits as $visit) {
                if (! $visit->agent_id) {
                    continue;
                }
                AppNotification::create([
                    'user_id' => $visit->agent_id,
                    'type' => NotificationType::Visit->value,
                    'delivery_channel' => NotificationChannel::App->value,
                    'title' => 'Visite planifiée',
                    'body' => 'Visite programmée pour '.$visit->scheduled_at?->format('d/m/Y H:i'),
                    'data' => ['status' => $visit->status?->value],
                    'referenceable_id' => $visit->id,
                    'referenceable_type' => 'property_visit',
                    'is_read' => $this->ctx->faker()->boolean(50),
                    'read_at' => $this->ctx->faker()->boolean(50) ? $visit->created_at : null,
                    'sent_at' => $visit->created_at,
                    'created_at' => $visit->created_at,
                    'updated_at' => $visit->created_at,
                ]);
            }
        });
    }

    private function fromLeasePayments(): void
    {
        LeasePayment::query()
            ->with('lease:id,landlord_id,reference_number')
            ->chunkById(200, function ($payments) {
                foreach ($payments as $payment) {
                    $lease = $payment->lease;
                    if (! $lease) {
                        continue;
                    }

                    if ($payment->paid_at) {
                        AppNotification::create([
                            'user_id' => $lease->landlord_id,
                            'type' => NotificationType::Payment->value,
                            'delivery_channel' => NotificationChannel::App->value,
                            'title' => 'Paiement reçu',
                            'body' => 'Un paiement de loyer a été enregistré pour le bail '.$lease->reference_number,
                            'data' => ['amount' => $payment->amount, 'currency' => $payment->currency],
                            'referenceable_id' => $payment->id,
                            'referenceable_type' => 'lease_payment',
                            'is_read' => $this->ctx->faker()->boolean(60),
                            'read_at' => $this->ctx->faker()->boolean(60) ? $payment->paid_at : null,
                            'sent_at' => $payment->paid_at,
                            'created_at' => $payment->paid_at,
                            'updated_at' => $payment->paid_at,
                        ]);
                    }

                    if ($lease->landlord_id && $payment->due_date) {
                        $sentAt = CarbonImmutable::parse($payment->due_date)->subDays(3);
                        AppNotification::create([
                            'user_id' => $lease->landlord_id,
                            'type' => NotificationType::Payment->value,
                            'delivery_channel' => NotificationChannel::App->value,
                            'title' => 'Rappel de paiement',
                            'body' => 'Loyer dû le '.CarbonImmutable::parse($payment->due_date)->format('d/m/Y'),
                            'data' => ['amount' => $payment->amount, 'currency' => $payment->currency],
                            'referenceable_id' => $payment->id,
                            'referenceable_type' => 'lease_payment',
                            'is_read' => $payment->paid_at !== null,
                            'read_at' => $payment->paid_at,
                            'sent_at' => $sentAt,
                            'created_at' => $sentAt,
                            'updated_at' => $sentAt,
                        ]);
                    }
                }
            });
    }

    private function fromBookings(): void
    {
        Booking::query()->chunkById(100, function ($bookings) {
            foreach ($bookings as $booking) {
                AppNotification::create([
                    'user_id' => $booking->created_by_id,
                    'type' => NotificationType::Booking->value,
                    'delivery_channel' => NotificationChannel::App->value,
                    'title' => 'Nouvelle réservation',
                    'body' => 'Une réservation '.$booking->reference_number.' a été créée.',
                    'data' => ['status' => $booking->status?->value],
                    'referenceable_id' => $booking->id,
                    'referenceable_type' => 'booking',
                    'is_read' => $this->ctx->faker()->boolean(50),
                    'read_at' => $this->ctx->faker()->boolean(50) ? $booking->created_at : null,
                    'sent_at' => $booking->created_at,
                    'created_at' => $booking->created_at,
                    'updated_at' => $booking->created_at,
                ]);
            }
        });
    }

    private function fromMaintenance(): void
    {
        MaintenanceRequest::query()->chunkById(100, function ($requests) {
            foreach ($requests as $request) {
                AppNotification::create([
                    'user_id' => $request->assigned_to ?? $request->requester_id,
                    'type' => NotificationType::Maintenance->value,
                    'delivery_channel' => NotificationChannel::App->value,
                    'title' => 'Demande de maintenance',
                    'body' => $request->title,
                    'data' => ['priority' => $request->priority?->value, 'status' => $request->status?->value],
                    'referenceable_id' => $request->id,
                    'referenceable_type' => 'maintenance',
                    'is_read' => $this->ctx->faker()->boolean(40),
                    'read_at' => $this->ctx->faker()->boolean(40) ? $request->created_at : null,
                    'sent_at' => $request->created_at,
                    'created_at' => $request->created_at,
                    'updated_at' => $request->created_at,
                ]);
            }
        });
    }

    private function fromLeases(): void
    {
        Lease::query()->chunkById(100, function ($leases) {
            foreach ($leases as $lease) {
                AppNotification::create([
                    'user_id' => $lease->landlord_id,
                    'type' => NotificationType::Lease->value,
                    'delivery_channel' => NotificationChannel::App->value,
                    'title' => 'Nouveau bail',
                    'body' => 'Le bail '.$lease->reference_number.' a été créé.',
                    'data' => ['status' => $lease->status?->value],
                    'referenceable_id' => $lease->id,
                    'referenceable_type' => 'lease',
                    'is_read' => true,
                    'read_at' => $lease->created_at,
                    'sent_at' => $lease->created_at,
                    'created_at' => $lease->created_at,
                    'updated_at' => $lease->created_at,
                ]);
            }
        });
    }
}
