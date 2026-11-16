<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Policies\DocumentPolicy;
use App\Policies\PropertyVisitPolicy;
use App\Services\Payments\TenantRentSummary;
use App\Services\Visit\VisitSchedulingService;

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
        $lateFees = null;
        $visits = [];

        if ($customerIds !== []) {
            $activeLeases = Lease::query()
                ->whereIn('tenant_id', $customerIds)
                // TCK-1001 — un bail en préavis est encore en cours pour le locataire.
                ->whereIn('status', User::ACTIVE_TENANT_LEASE_STATUSES)
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

            // P206.03 (ADR-0057, amendement du 2026-10-24) — les pénalités à recouvrer, à part.
            $lateFees = CollectedPayments::lateFeesOutstanding()
                ->whereIn('lease_payments.payer_id', $customerIds)
                ->toBase()
                ->selectRaw('COUNT(*) AS n, COALESCE(SUM('.CollectedPayments::LATE_FEE_OUTSTANDING_SQL.'), 0) AS total')
                ->first();

            $visits = PropertyVisit::query()
                ->whereIn('customer_id', $customerIds)
                ->whereIn('status', [VisitStatus::Scheduled->value, VisitStatus::Confirmed->value])
                ->where('scheduled_at', '>=', now())
                // TCK-2851 — la photo, le lieu et l'agent de chaque visite, chargés en groupe ; l'agence du
                // bien (`agency_id` sélectionné) rend `requiresWatermark()` sans requête par bien.
                ->with([
                    'property:id,title,agency_id',
                    'property.agency',
                    'property.media',
                    'property.address',
                    'agent:id,first_name,last_name',
                    'customer:id,user_id',
                ])
                ->orderBy('scheduled_at')
                ->limit(self::UPCOMING_VISITS)
                ->get(['id', 'property_id', 'customer_id', 'visitor_id', 'agent_id', 'scheduled_at', 'status'])
                ->map(fn (PropertyVisit $v): array => $this->visitRow($v, $user))
                ->all();
        }

        $openMaintenance = MaintenanceRequest::query()
            ->where('requester_id', $user->id)
            ->open()
            ->count();

        // TCK-2759 (ADR-0099, amendement du 2026-11-12) — un document interne de sa fiche n'entre pas
        // dans les récents du sujet : la forme SQL de `DocumentPolicy::readsInternalOf()`.
        $recentDocs = DocumentPolicy::restreindreAuxLecteursDInternes(Document::query(), $user)
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
            'has_customer_profile' => $customerIds !== [],
            'leases' => ['active' => $activeLeases],
            'bookings' => ['pending' => $pendingBookings],
            'payments' => [
                'next_due' => $nextDue,
                'upcoming_30d' => $upcoming,
                'overdue_count' => (int) ($overdue->n ?? 0),
                'overdue_amount' => round((float) ($overdue->total ?? 0), 2),
                'late_fees_outstanding_count' => (int) ($lateFees->n ?? 0),
                'late_fees_outstanding_amount' => round((float) ($lateFees->total ?? 0), 2),
            ],
            'visits' => ['upcoming' => $visits],
            'maintenance' => ['open' => $openMaintenance],
            'documents' => ['recent' => $recentDocs],
        ];
    }

    /**
     * TCK-2851 — une visite à venir de l'accueil du client : la photo et le lieu (quartier, ville) du
     * bien ; ses coordonnées seulement une fois la visite CONFIRMÉE (la règle de l'adresse de
     * `PropertyVisitResource::adresseLisible`, clé absente sinon) ; le nom de l'agent attribué, sans
     * contact ; `can_reschedule`, la Policy du report ({@see PropertyVisitPolicy::reschedule()})
     * sur une visite encore active ({@see VisitSchedulingService::ACTIVE_STATUSES}).
     *
     * @return array<string, mixed>
     */
    private function visitRow(PropertyVisit $v, User $user): array
    {
        $property = $v->property;
        $confirmed = $v->status === VisitStatus::Confirmed;
        $address = $property?->address;

        return [
            'id' => $v->id,
            'scheduled_at' => $v->scheduled_at?->toIso8601String(),
            'status' => $v->status?->value,
            'property' => $property ? [
                'id' => $property->id,
                'title' => $property->title,
                'cover_url' => TenantRentSummary::coverUrl($property),
                'address_line' => TenantRentSummary::addressLine($property),
                ...($confirmed ? ['coordinates' => $address !== null && $address->latitude !== null && $address->longitude !== null
                    ? ['lat' => (float) $address->latitude, 'lng' => (float) $address->longitude]
                    : null] : []),
            ] : null,
            'agent' => $v->agent ? ['name' => $v->agent->full_name] : null,
            'can_reschedule' => in_array($v->status, VisitSchedulingService::ACTIVE_STATUSES, true)
                && $user->can('reschedule', $v),
        ];
    }
}
