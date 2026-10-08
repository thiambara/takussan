<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Task;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Support\Facades\DB;

/**
 * TCK-596 — la tâche « remboursement à traiter » d'une réservation fermée qui porte un acompte
 * encaissé. Une `Task` existante (`taskable` = la réservation, `metadata.kind = booking_refund`) :
 * aucune table neuve, et elle apparaît là où l'on traite déjà ses tâches.
 *
 * Aucun argent ne bouge ici : la tâche SIGNALE. Le geste reste `POST booking-payments/{id}/refund`,
 * et tout décaissement réel appartient à TCK-594.
 */
class BookingRefundTaskService
{
    public const KIND = 'booking_refund';

    public function __construct(
        private readonly BookingStakeholders $stakeholders,
        private readonly MembershipCapabilityResolver $membership,
    ) {}

    /**
     * Ouvre la tâche, une seule fois par réservation. Rien si aucun paiement n'est `paid`.
     *
     * Le point de sérialisation est la ligne de la réservation (piège PostgreSQL n° 2) : deux
     * fermetures concurrentes — un `cancel` et une expiration — ne créent pas deux tâches.
     */
    public function openFor(Booking $booking, ?int $authorId = null): ?Task
    {
        return DB::transaction(function () use ($booking, $authorId): ?Task {
            Booking::query()->whereKey($booking->getKey())->lockForUpdate()->first();

            $paidIds = $booking->payments()
                ->where('status', PaymentStatus::Paid->value)
                ->orderBy('id')
                ->pluck('id')
                ->map(static fn ($id): int => (int) $id)
                ->all();

            if ($paidIds === []) {
                return null;
            }

            $existing = $this->taskFor($booking);
            if ($existing !== null) {
                return $existing;
            }

            return Task::create([
                'title' => __('bookings.refund_task.title', ['reference' => $booking->reference_number ?? (string) $booking->id]),
                'taskable_type' => $booking->getMorphClass(),
                'taskable_id' => $booking->getKey(),
                'assigned_to_id' => $this->assigneeFor($booking)?->id,
                'created_by_id' => $authorId,
                'status' => TaskStatus::Open,
                'priority' => TaskPriority::High,
                'metadata' => ['kind' => self::KIND, 'booking_payment_ids' => $paidIds],
            ]);
        });
    }

    /**
     * Clôt la tâche (`done`) quand plus aucun paiement de la réservation n'est `paid`.
     */
    public function closeIfSettled(Booking $booking): void
    {
        if ($booking->payments()->where('status', PaymentStatus::Paid->value)->exists()) {
            return;
        }

        $task = $this->taskFor($booking);
        if ($task === null || in_array($task->status, [TaskStatus::Done, TaskStatus::Cancelled], true)) {
            return;
        }

        $task->update(['status' => TaskStatus::Done, 'completed_at' => now()]);
    }

    public function taskFor(Booking $booking): ?Task
    {
        return Task::query()
            ->where('taskable_type', $booking->getMorphClass())
            ->where('taskable_id', $booking->getKey())
            ->where('metadata->kind', self::KIND)
            ->first();
    }

    /**
     * Option retenue par défaut (question non tranchée) : l'auteur de la réservation s'il est du
     * personnel ; sinon le premier collaborateur accepté `manager` puis `agent` du bien ; sinon le
     * premier admin de l'agence ; sinon le bailleur (hôte sans agence).
     */
    public function assigneeFor(Booking $booking): ?User
    {
        $booking->loadMissing(['createdBy', 'property.owner']);
        $agencyId = $this->stakeholders->agencyId($booking);

        $author = $booking->createdBy;
        if ($author !== null && $agencyId !== null && $this->membership->isStaffAt($author, $agencyId)) {
            return $author;
        }

        $collaborator = $this->stakeholders->collaborators($booking, $agencyId)->first();
        if ($collaborator !== null) {
            return $collaborator;
        }

        if ($agencyId !== null) {
            $admin = AgencyAdminProfile::query()
                ->with('user')
                ->where('agency_id', $agencyId)
                ->active()
                ->orderBy('id')
                ->first()
                ?->user;
            if ($admin !== null) {
                return $admin;
            }
        }

        return $booking->property?->owner;
    }
}
