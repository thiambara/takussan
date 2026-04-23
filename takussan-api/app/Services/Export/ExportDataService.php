<?php

namespace App\Services\Export;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;

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
                'late_fee' => (float) $p->late_fee,
            ];
        })->all();

        return [
            'columns' => ['id', 'reference', 'lease', 'payer', 'amount', 'currency', 'payment_method', 'payment_type', 'due_date', 'paid_at', 'status', 'late_fee'],
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
     * Dispatch an entity name → dataset resolver.
     */
    public function collect(string $entity, User $actor, array $filters = []): array
    {
        return match ($entity) {
            'payments' => $this->payments($actor, $filters),
            'leases' => $this->leases($actor, $filters),
            'customers' => $this->customers($actor, $filters),
            'properties' => $this->properties($actor, $filters),
            default => throw new \InvalidArgumentException("Unknown export entity: {$entity}"),
        };
    }

    protected function scopeToActor($query, User $actor, string $entity): void
    {
        // Super admin / platform admin can see everything
        if ($actor->hasRole(['super_admin', 'admin'])) {
            return;
        }

        $agencyId = $actor->agency_id;

        if ($actor->hasRole(['agency_admin', 'agent']) && $agencyId) {
            match ($entity) {
                'property', 'customer' => $query->where('agency_id', $agencyId),
                'lease' => $query->where('agency_id', $agencyId),
                'lease_payment' => $query->whereHas('lease', fn ($q) => $q->where('agency_id', $agencyId)),
                default => null,
            };

            return;
        }

        if ($actor->hasRole('owner')) {
            match ($entity) {
                'property' => $query->where('user_id', $actor->id),
                'lease' => $query->where('landlord_id', $actor->id),
                'lease_payment' => $query->whereHas('lease', fn ($q) => $q->where('landlord_id', $actor->id)),
                'customer' => $query->whereRaw('1 = 0'), // owners cannot export CRM
                default => null,
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
                default => null,
            };
        } else {
            $query->whereRaw('1 = 0');
        }
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
