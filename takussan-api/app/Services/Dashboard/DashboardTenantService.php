<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use App\Models\User;

/**
 * Tenant-facing dashboard — upcoming payments, active lease, documents.
 *
 * TCK-595 — ce qui attend le client, sur TOUTES ses fiches `Customer`. Chaque agence rattache sa
 * propre fiche au compte (`CustomerService::linkUser`) et rien n'impose l'unicité de
 * `customers.user_id` : `->first()` faisait disparaître les baux, échéances et impayés de la seconde
 * agence. Les échéances suivent la règle *Impayé* ({@see CollectedPayments::leaseOwed()}) : une
 * restitution de caution, que le locataire REÇOIT, n'est jamais un « prochain loyer ». Sans aucune
 * fiche, l'accueil rend des zéros et ce que le compte possède en propre (demandes d'intervention,
 * documents déposés) au lieu de court-circuiter.
 */
class DashboardTenantService
{
    /** Nombre de visites à venir rendues. */
    private const UPCOMING_VISITS = 5;

    public function summary(User $user): array
    {
        $customerIds = Customer::query()->where('user_id', $user->id)->orderBy('id')->pluck('id')->all();
        $today = now()->toDateString();

        $owed = fn () => CollectedPayments::leaseOwed()->whereIn('lease_payments.payer_id', $customerIds);

        $paymentRow = fn (LeasePayment $p): array => [
            'id' => $p->id,
            'lease_id' => $p->lease_id,
            'amount' => (float) $p->amount,
            'currency' => $p->currency?->value,
            'due_date' => $p->due_date?->toDateString(),
            'status' => $p->status?->value,
        ];

        $activeLeases = 0;
        $pendingBookings = 0;
        $nextDue = null;
        $upcoming = [];
        $overdue = null;
        $visits = [];

        if ($customerIds !== []) {
            $activeLeases = Lease::query()
                ->whereIn('tenant_id', $customerIds)
                ->where('status', LeaseStatus::Active->value)
                ->count();

            $pendingBookings = Booking::query()
                ->whereIn('customer_id', $customerIds)
                ->where('status', BookingStatus::Pending->value)
                ->count();

            // La plus proche échéance NON échue : une échéance passée relève des impayés.
            $upcomingRows = $owed()
                ->whereDate('lease_payments.due_date', '>=', $today)
                ->whereDate('lease_payments.due_date', '<=', now()->addDays(30)->toDateString())
                ->orderBy('lease_payments.due_date')
                ->get(['id', 'lease_id', 'amount', 'currency', 'due_date', 'status']);
            $upcoming = $upcomingRows->map($paymentRow)->all();

            $next = $upcomingRows->first() ?? $owed()
                ->whereDate('lease_payments.due_date', '>=', $today)
                ->orderBy('lease_payments.due_date')
                ->first(['id', 'lease_id', 'amount', 'currency', 'due_date', 'status']);
            $nextDue = $next ? $paymentRow($next) : null;

            $overdue = $owed()
                ->whereDate('lease_payments.due_date', '<', $today)
                ->toBase()
                ->selectRaw('COUNT(*) AS n, COALESCE(SUM('.CollectedPayments::OWED_REMAINING_SQL.'), 0) AS total')
                ->first();

            $visits = PropertyVisit::query()
                ->whereIn('customer_id', $customerIds)
                ->whereIn('status', [VisitStatus::Scheduled->value, VisitStatus::Confirmed->value])
                ->where('scheduled_at', '>=', now())
                ->with('property:id,title')
                ->orderBy('scheduled_at')
                ->limit(self::UPCOMING_VISITS)
                ->get(['id', 'property_id', 'scheduled_at', 'status'])
                ->map(fn (PropertyVisit $v): array => [
                    'id' => $v->id,
                    'scheduled_at' => $v->scheduled_at?->toIso8601String(),
                    'status' => $v->status?->value,
                    'property' => $v->property ? ['id' => $v->property->id, 'title' => $v->property->title] : null,
                ])
                ->all();
        }

        $openMaintenance = MaintenanceRequest::query()
            ->where('requester_id', $user->id)
            ->whereIn('status', [MaintenanceStatus::Open->value, MaintenanceStatus::InProgress->value])
            ->count();

        $recentDocs = Document::query()
            ->where(function ($q) use ($user, $customerIds) {
                $q->where('uploaded_by', $user->id);
                if ($customerIds !== []) {
                    $q->orWhere(fn ($qq) => $qq->where('documentable_type', Customer::class)->whereIn('documentable_id', $customerIds));
                }
            })
            ->latest('created_at')
            ->limit(5)
            ->get(['id', 'name', 'type', 'created_at'])
            ->map(fn ($d) => [
                'id' => $d->id,
                'name' => $d->name,
                'type' => $d->type?->value,
                'created_at' => $d->created_at?->toIso8601String(),
            ])->all();

        return [
            'tenant_id' => $user->id,
            'customer_id' => $customerIds[0] ?? null,
            'has_customer_profile' => $customerIds !== [],
            'leases' => ['active' => $activeLeases],
            'bookings' => ['pending' => $pendingBookings],
            'payments' => [
                'next_due' => $nextDue,
                'upcoming_30d' => $upcoming,
                'overdue_count' => (int) ($overdue->n ?? 0),
                'overdue_amount' => round((float) ($overdue->total ?? 0), 2),
            ],
            'visits' => ['upcoming' => $visits],
            'maintenance' => ['open' => $openMaintenance],
            'documents' => ['recent' => $recentDocs],
        ];
    }
}
