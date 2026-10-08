<?php

namespace App\Services\Export;

use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Reporting\AgingBalanceService;
use Illuminate\Support\Carbon;

/**
 * Collects rows for the CSV/XLSX/PDF exports (TCK-032 P2).
 *
 * Scoping follows the actor's role — agency_admin/super_admin see all data in
 * their agency; owners see only their own leases/properties; tenants only
 * their own payments. This mirrors the dashboard services.
 */
class ExportDataService
{
    /**
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function payments(User $actor, array $filters = []): array
    {
        $query = LeasePayment::query()
            ->with(['lease:id,reference_number,agency_id,landlord_id', 'payer:id,first_name,last_name']);

        $this->scopeToActor($query, $actor, 'lease_payment');

        $this->applyRangeFilter($query, 'due_date', $filters['from'] ?? null, $filters['to'] ?? null);

        $rows = $query->orderByDesc('due_date')->limit($this->limit($filters))->get()->map(function ($p) {
            return [
                'id' => $p->id,
                'reference' => $p->reference_number,
                'lease' => $p->lease?->reference_number,
                'payer' => $p->payer ? trim("{$p->payer->first_name} {$p->payer->last_name}") : null,
                'amount' => (float) $p->amount,
                'currency' => $p->currency?->value,
                'payment_method' => $p->payment_method?->value,
                'payment_type' => $p->payment_type?->value,
                'due_date' => $p->due_date?->toDateString(),
                'paid_at' => $p->paid_at?->toDateTimeString(),
                'status' => $p->status?->value,
                'late_fee_amount' => (float) $p->late_fee_amount,
            ];
        })->all();

        return [
            'columns' => ['id', 'reference', 'lease', 'payer', 'amount', 'currency', 'payment_method', 'payment_type', 'due_date', 'paid_at', 'status', 'late_fee_amount'],
            'rows' => $rows,
            'filename' => 'payments-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function leases(User $actor, array $filters = []): array
    {
        $query = Lease::query()
            ->with(['property:id,title,reference_number', 'tenant:id,first_name,last_name', 'landlord:id,first_name,last_name']);

        $this->scopeToActor($query, $actor, 'lease');

        $this->applyRangeFilter($query, 'start_date', $filters['from'] ?? null, $filters['to'] ?? null);

        $rows = $query->orderByDesc('start_date')->limit($this->limit($filters))->get()->map(function ($l) {
            return [
                'id' => $l->id,
                'reference' => $l->reference_number,
                'property' => $l->property?->title,
                'tenant' => $l->tenant ? trim("{$l->tenant->first_name} {$l->tenant->last_name}") : null,
                'landlord' => $l->landlord ? trim("{$l->landlord->first_name} {$l->landlord->last_name}") : null,
                'monthly_rent' => (float) $l->monthly_rent,
                'currency' => $l->currency?->value,
                'type' => $l->type?->value,
                'status' => $l->status?->value,
                'start_date' => $l->start_date?->toDateString(),
                'end_date' => $l->end_date?->toDateString(),
                'signed_at' => $l->signed_at?->toDateTimeString(),
            ];
        })->all();

        return [
            'columns' => ['id', 'reference', 'property', 'tenant', 'landlord', 'monthly_rent', 'currency', 'type', 'status', 'start_date', 'end_date', 'signed_at'],
            'rows' => $rows,
            'filename' => 'leases-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function customers(User $actor, array $filters = []): array
    {
        $query = Customer::query();
        $this->scopeToActor($query, $actor, 'customer');
        $this->applyRangeFilter($query, 'created_at', $filters['from'] ?? null, $filters['to'] ?? null);

        $rows = $query->orderByDesc('created_at')->limit($this->limit($filters))->get()->map(function ($c) {
            return [
                'id' => $c->id,
                'first_name' => $c->first_name,
                'last_name' => $c->last_name,
                'email' => $c->email,
                'phone' => $c->phone,
                'status' => $c->status?->value,
                'pipeline_stage' => $c->pipeline_stage?->value,
                'occupation' => $c->occupation,
                'created_at' => $c->created_at?->toDateTimeString(),
            ];
        })->all();

        return [
            'columns' => ['id', 'first_name', 'last_name', 'email', 'phone', 'status', 'pipeline_stage', 'occupation', 'created_at'],
            'rows' => $rows,
            'filename' => 'customers-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function properties(User $actor, array $filters = []): array
    {
        $query = Property::query();
        $this->scopeToActor($query, $actor, 'property');
        $this->applyRangeFilter($query, 'created_at', $filters['from'] ?? null, $filters['to'] ?? null);

        $rows = $query->orderByDesc('created_at')->limit($this->limit($filters))->get()->map(function ($p) {
            return [
                'id' => $p->id,
                'reference' => $p->reference_number,
                'title' => $p->title,
                'type' => $p->type?->value,
                'contract_type' => $p->contract_type?->value,
                'status' => $p->status?->value,
                'price' => (float) $p->price,
                'currency' => $p->currency?->value,
                'area' => $p->area,
                'bedrooms' => $p->bedrooms,
                'bathrooms' => $p->bathrooms,
                'created_at' => $p->created_at?->toDateTimeString(),
            ];
        })->all();

        return [
            'columns' => ['id', 'reference', 'title', 'type', 'contract_type', 'status', 'price', 'currency', 'area', 'bedrooms', 'bathrooms', 'created_at'],
            'rows' => $rows,
            'filename' => 'properties-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * TCK-595 (§7) — les reversements de l'agence, une ligne par sortie d'argent (ADR-0039).
     *
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function payouts(User $actor, array $filters = []): array
    {
        $query = Payout::query()
            ->with(['lease:id,reference_number', 'landlord:id,first_name,last_name']);

        $this->scopeToActor($query, $actor, 'payout');
        $this->applyRangeFilter($query, 'created_at', $filters['from'] ?? null, $filters['to'] ?? null);

        $rows = $query->orderByDesc('created_at')->limit($this->limit($filters))->get()->map(fn ($p) => [
            'id' => $p->id,
            'reference' => $p->reference_number,
            'payee_role' => $p->payee_role?->value,
            'payee' => $this->fullName($p->landlord),
            'lease' => $p->lease?->reference_number,
            'period_start' => $p->period_start?->toDateString(),
            'period_end' => $p->period_end?->toDateString(),
            'gross_amount' => (float) $p->gross_amount,
            'commission_amount' => (float) $p->commission_amount,
            'fees_amount' => (float) $p->fees_amount,
            'net_amount' => (float) $p->net_amount,
            'currency' => $p->currency?->value,
            'status' => $p->status?->value,
            'approved_at' => $p->approved_at?->toDateTimeString(),
            'processed_at' => $p->processed_at?->toDateTimeString(),
        ])->all();

        return [
            'columns' => ['id', 'reference', 'payee_role', 'payee', 'lease', 'period_start', 'period_end', 'gross_amount', 'commission_amount', 'fees_amount', 'net_amount', 'currency', 'status', 'approved_at', 'processed_at'],
            'rows' => $rows,
            'filename' => 'payouts-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * TCK-595 (§7) — les factures et avoirs de l'agence.
     *
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function invoices(User $actor, array $filters = []): array
    {
        $query = Invoice::query()->with('customer:id,first_name,last_name');

        $this->scopeToActor($query, $actor, 'invoice');
        $this->applyRangeFilter($query, 'issue_date', $filters['from'] ?? null, $filters['to'] ?? null);

        $rows = $query->orderByDesc('issue_date')->orderByDesc('id')->limit($this->limit($filters))->get()->map(fn ($i) => [
            'id' => $i->id,
            'reference' => $i->reference_number,
            'kind' => $i->kind?->value,
            'customer' => $this->fullName($i->customer),
            'issue_date' => $i->issue_date?->toDateString(),
            'due_date' => $i->due_date?->toDateString(),
            'subtotal' => (float) $i->subtotal,
            'tax_amount' => (float) $i->tax_amount,
            'total_amount' => (float) $i->total_amount,
            'currency' => $i->currency?->value,
            'status' => $i->status?->value,
        ])->all();

        return [
            'columns' => ['id', 'reference', 'kind', 'customer', 'issue_date', 'due_date', 'subtotal', 'tax_amount', 'total_amount', 'currency', 'status'],
            'rows' => $rows,
            'filename' => 'invoices-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * TCK-595 (ADR-0049 §3) — le grand livre des commissions de l'agence.
     *
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function commissions(User $actor, array $filters = []): array
    {
        $query = CommissionEntry::query()
            ->with(['lease:id,reference_number', 'beneficiary:id,first_name,last_name']);

        // verif-595 M2 — le périmètre du relevé, pas seulement l'agence : sans `viewReports`, ses lignes.
        $query->visibleTo($actor);
        $this->applyRangeFilter($query, 'earned_at', $filters['from'] ?? null, $filters['to'] ?? null);

        $rows = $query->orderByDesc('earned_at')->orderByDesc('id')->limit($this->limit($filters))->get()->map(fn ($c) => [
            'id' => $c->id,
            'lease' => $c->lease?->reference_number,
            'beneficiary' => $this->fullName($c->beneficiary),
            'origin' => $c->origin?->value,
            'base_amount' => (float) $c->base_amount,
            'share_percent' => (float) $c->share_percent,
            'amount' => (float) $c->amount,
            'currency' => $c->currency?->value,
            'status' => $c->status?->value,
            'earned_at' => $c->earned_at?->toDateTimeString(),
            'paid_at' => $c->paid_at?->toDateTimeString(),
        ])->all();

        return [
            'columns' => ['id', 'lease', 'beneficiary', 'origin', 'base_amount', 'share_percent', 'amount', 'currency', 'status', 'earned_at', 'paid_at'],
            'rows' => $rows,
            'filename' => 'commissions-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * TCK-595 (§7, AD17) — la balance âgée à la ligne : chaque échéance impayée et échue, avec son
     * retard et sa tranche. La règle est celle de `AgingBalanceService` (*Impayé* : `pending`,
     * `partially_paid` ou `late`, jamais une restitution de caution), qui en rend l'agrégat :
     * `amount` est le RESTE DÛ, pour que la somme de l'export soit celle de la balance.
     *
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function aging(User $actor, array $filters = []): array
    {
        $today = Carbon::today();
        $query = CollectedPayments::leaseOwed()
            ->whereDate('due_date', '<', $today->toDateString())
            ->with(['lease:id,reference_number,landlord_id', 'lease.landlord:id,first_name,last_name', 'payer:id,first_name,last_name']);

        $this->scopeToActor($query, $actor, 'lease_payment');
        $this->applyRangeFilter($query, 'due_date', $filters['from'] ?? null, $filters['to'] ?? null);

        $rows = $query->orderBy('due_date')->orderBy('id')->limit($this->limit($filters))->get()->map(function ($p) use ($today) {
            $days = (int) $p->due_date->diffInDays($today);

            return [
                'id' => $p->id,
                'reference' => $p->reference_number,
                'lease' => $p->lease?->reference_number,
                'tenant' => $this->fullName($p->payer),
                'landlord' => $this->fullName($p->lease?->landlord),
                'due_date' => $p->due_date?->toDateString(),
                'days_overdue' => $days,
                'bucket' => $this->agingBucket($days),
                'amount' => (float) $p->remaining_amount,
                'currency' => $p->currency?->value,
                'status' => $p->status?->value,
            ];
        })->all();

        return [
            'columns' => ['id', 'reference', 'lease', 'tenant', 'landlord', 'due_date', 'days_overdue', 'bucket', 'amount', 'currency', 'status'],
            'rows' => $rows,
            'filename' => 'aging-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * TCK-595 (§7) — les cautions détenues, une ligne par bail : encaissées moins restituées, payées
     * (la règle de `AgingBalanceService::depositsHeld`). Un stock, sans borne de dates.
     *
     * @return array{columns: array<int,string>, rows: array<int,array<string,mixed>>, filename: string}
     */
    public function deposits(User $actor, array $filters = []): array
    {
        $query = LeasePayment::query()
            ->where('status', PaymentStatus::Paid->value)
            ->whereIn('payment_type', [LeasePaymentType::Deposit->value, LeasePaymentType::DepositRefund->value]);

        $this->scopeToActor($query, $actor, 'lease_payment');

        $sums = $query->toBase()
            ->selectRaw(
                'lease_id, SUM(CASE WHEN payment_type = ? THEN amount ELSE 0 END) AS collected, SUM(CASE WHEN payment_type = ? THEN amount ELSE 0 END) AS refunded',
                [LeasePaymentType::Deposit->value, LeasePaymentType::DepositRefund->value],
            )
            ->groupBy('lease_id')
            ->get()
            ->filter(fn ($row) => round((float) $row->collected - (float) $row->refunded, 2) != 0.0)
            ->keyBy('lease_id');

        $leases = Lease::query()
            ->whereIn('id', $sums->keys()->all())
            ->with(['property:id,title', 'tenant:id,first_name,last_name', 'landlord:id,first_name,last_name'])
            ->orderBy('id')
            ->limit($this->limit($filters))
            ->get();

        $rows = $leases->map(function ($l) use ($sums) {
            $sum = $sums[$l->id];

            return [
                'lease' => $l->reference_number,
                'property' => $l->property?->title,
                'tenant' => $this->fullName($l->tenant),
                'landlord' => $this->fullName($l->landlord),
                'collected' => round((float) $sum->collected, 2),
                'refunded' => round((float) $sum->refunded, 2),
                'held' => round((float) $sum->collected - (float) $sum->refunded, 2),
                'currency' => $l->currency?->value,
            ];
        })->all();

        return [
            'columns' => ['lease', 'property', 'tenant', 'landlord', 'collected', 'refunded', 'held', 'currency'],
            'rows' => $rows,
            'filename' => 'deposits-'.now()->format('Ymd-His'),
        ];
    }

    /**
     * Dispatch an entity name → dataset resolver.
     */
    public function collect(string $entity, User $actor, array $filters = []): array
    {
        return match ($entity) {
            'payments' => $this->payments($actor, $filters),
            'leases' => $this->leases($actor, $filters),
            'customers' => $this->customers($actor, $filters),
            'properties' => $this->properties($actor, $filters),
            'payouts' => $this->payouts($actor, $filters),
            'invoices' => $this->invoices($actor, $filters),
            'commissions' => $this->commissions($actor, $filters),
            'aging' => $this->aging($actor, $filters),
            'deposits' => $this->deposits($actor, $filters),
            default => throw new \InvalidArgumentException("Unknown export entity: {$entity}"),
        };
    }

    protected function scopeToActor($query, User $actor, string $entity): void
    {
        // Super admin / platform admin can see everything
        if ($actor->isSuperAdmin()) {
            return;
        }

        $agencyId = $actor->agency_id;

        // TCK-587 (ADR-0031 §1) — le périmètre de l'agence est celui de son PERSONNEL actif.
        if (($staffAgencyId = $actor->staffAgencyId()) !== null) {
            $agencyId = $staffAgencyId;
            match ($entity) {
                'property', 'customer' => $query->where('agency_id', $agencyId),
                'lease' => $query->where('agency_id', $agencyId),
                'lease_payment' => $query->whereHas('lease', fn ($q) => $q->where('agency_id', $agencyId)),
                // TCK-595 (§7) — les exports financiers portent leur agence en colonne.
                'payout', 'invoice' => $query->where('agency_id', $agencyId),
                default => null,
            };

            return;
        }

        if ($agencyId && $actor->isOwnerAt((int) $agencyId)) {
            match ($entity) {
                'property' => $query->where('user_id', $actor->id),
                'lease' => $query->where('landlord_id', $actor->id),
                'lease_payment' => $query->whereHas('lease', fn ($q) => $q->where('landlord_id', $actor->id)),
                'customer' => $query->whereRaw('1 = 0'), // owners cannot export CRM
                // TCK-595 — un export financier d'agence n'est jamais celui du bailleur.
                default => $query->whereRaw('1 = 0'),
            };

            return;
        }

        // Tenants / customers: only their own payments
        $customer = Customer::where('user_id', $actor->id)->first();
        if ($customer) {
            match ($entity) {
                'lease_payment' => $query->where('payer_id', $customer->id),
                'lease' => $query->where('tenant_id', $customer->id),
                'property' => $query->whereRaw('1 = 0'),
                'customer' => $query->where('id', $customer->id),
                default => $query->whereRaw('1 = 0'),
            };
        } else {
            $query->whereRaw('1 = 0');
        }
    }

    /** La tranche de `AgingBalanceService::BUCKETS` d'un retard en jours. */
    protected function agingBucket(int $days): ?string
    {
        foreach (AgingBalanceService::BUCKETS as $label => [$min, $max]) {
            if ($days >= $min && ($max === null || $days <= $max)) {
                return $label;
            }
        }

        return null;
    }

    protected function fullName(?object $person): ?string
    {
        return $person ? trim("{$person->first_name} {$person->last_name}") : null;
    }

    protected function applyRangeFilter($query, string $column, ?string $from, ?string $to): void
    {
        if ($from) {
            $query->whereDate($column, '>=', $from);
        }
        if ($to) {
            $query->whereDate($column, '<=', $to);
        }
    }

    protected function limit(array $filters): int
    {
        $limit = (int) ($filters['limit'] ?? 5000);

        return max(1, min($limit, 50_000));
    }
}
