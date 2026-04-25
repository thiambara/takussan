<?php

namespace App\Services\Lease;

use App\Events\Lease\LeaseRenewed;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Setting;
use App\Models\User;
use App\Services\Model\ReferenceNumberGenerator;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-089 — Renouvellement / avenant de bail.
 *
 * Crée un Lease enfant chaîné via `renewed_from_lease_id` (nom canonique
 * du spec models-spec §14 ; le ticket utilise l'alias `parent_lease_id`).
 * Cette implémentation conserve le nom du spec — les inclusions Spatie
 * sont également exposées sous `renewedFrom` / `renewals`.
 *
 * Les invariants stricts sont validés ici (et non dans le FormRequest)
 * parce qu'ils dépendent de l'état persistant de la chaîne (pas du seul
 * payload entrant) : profondeur de chaîne, status du parent, absence
 * d'enfant actif. Le FormRequest gère uniquement les bornes de payload
 * et l'immutabilité tenant/property.
 */
class LeaseRenewalService
{
    public const MAX_CHAIN_DEPTH = 10;

    /**
     * Statuts du parent autorisant un renouvellement.
     *
     * `EndingSoon` n'existe pas dans l'enum LeaseStatus actuel — on
     * s'aligne sur ce qui est implémenté côté domaine. Le ticket le
     * mentionne mais c'est une feature future ; quand l'enum sera étendu
     * il suffira d'ajouter le case ici.
     */
    public const RENEWABLE_PARENT_STATUSES = [
        LeaseStatus::Active,
        LeaseStatus::Expired,
    ];

    /**
     * @param  array<string,mixed>  $data
     */
    public function renew(Lease $parent, array $data, ?User $actor = null): Lease
    {
        // L'immutabilité tenant/property/landlord est purement payload :
        // pas besoin de la base, donc inutile d'attendre la transaction.
        $this->guardImmutableFields($data);

        return DB::transaction(function () use ($parent, $data, $actor) {
            // Verrou ligne sur le parent pour serialiser les renew()
            // concurrents : sans ça, deux requêtes simultanées peuvent
            // toutes deux passer guardNoActiveChild() et créer deux
            // enfants. Le lock est levé automatiquement à la sortie
            // de la transaction.
            $parent = Lease::query()->lockForUpdate()->findOrFail($parent->id);

            $this->guardParentStatus($parent);
            $this->guardNoActiveChild($parent);
            $this->guardMaxChainDepth($parent);

            $parentStart = $parent->start_date ? Carbon::parse($parent->start_date) : null;
            $parentEnd = $parent->end_date ? Carbon::parse($parent->end_date) : null;

            $startDate = isset($data['start_date'])
                ? Carbon::parse($data['start_date'])
                : ($parentEnd?->copy()->addDay() ?? Carbon::today());

            $endDate = isset($data['end_date']) ? Carbon::parse($data['end_date']) : null;

            // Invariant chronologie : si end_date est fourni, il doit être
            // strictement après start_date (qu'il soit explicite ou hérité
            // de parent.end_date+1). Le FormRequest ne couvre que le cas
            // où start_date est dans le payload.
            if ($endDate !== null && $endDate->lte($startDate)) {
                throw ValidationException::withMessages([
                    'end_date' => [__('messages.lease_renewal_end_after_start')],
                ])->status(422);
            }

            // Continuité dates : si chevauchement explicite, on ajuste
            // rétroactivement le end_date du parent à start_date - 1.
            if ($parentEnd !== null && $startDate->lt($parentEnd)) {
                $adjusted = $startDate->copy()->subDay();
                if ($parentStart !== null && $adjusted->lt($parentStart)) {
                    $adjusted = $parentStart->copy();
                }
                $parent->forceFill(['end_date' => $adjusted])->save();
            }

            $requireSignature = $this->requireSignatureFlag();
            $childStatus = $requireSignature ? LeaseStatus::PendingSignature : LeaseStatus::Active;

            $child = Lease::create([
                'property_id' => $parent->property_id,
                'landlord_id' => $parent->landlord_id,
                'tenant_id' => $parent->tenant_id,
                'agency_id' => $parent->agency_id,
                'guarantor_id' => $parent->guarantor_id,
                'renewed_from_lease_id' => $parent->id,
                'reference_number' => ReferenceNumberGenerator::lease(),
                'type' => $parent->type,
                'status' => $childStatus,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'monthly_rent' => $data['monthly_rent'] ?? $parent->monthly_rent,
                'sale_price' => $parent->sale_price,
                'currency' => $parent->currency,
                'deposit_amount' => $data['deposit_amount'] ?? $parent->deposit_amount,
                'commission_rate' => $data['commission_rate'] ?? $parent->commission_rate,
                'payment_frequency' => $parent->payment_frequency,
                'payment_day' => $parent->payment_day,
                'late_fee_percent' => $data['late_fee_percent'] ?? $parent->late_fee_percent,
                'late_fee_grace_days' => $data['late_fee_grace_days'] ?? $parent->late_fee_grace_days,
                'terms' => $data['terms'] ?? $parent->terms,
                'special_conditions' => $data['special_conditions'] ?? $parent->special_conditions,
                'signed_at' => $childStatus === LeaseStatus::Active ? now() : null,
            ]);

            $parent->forceFill(['status' => LeaseStatus::Renewed])->save();

            $changes = $this->diffChanges($parent, $child);

            activity('Lease')
                ->performedOn($parent)
                ->causedBy($actor)
                ->withProperties(['child_id' => $child->id, 'changes' => $changes])
                ->event('lease_renewed')
                ->log('lease_renewed');

            activity('Lease')
                ->performedOn($child)
                ->causedBy($actor)
                ->withProperties(['parent_lease_id' => $parent->id, 'renewed_from_lease_id' => $parent->id])
                ->event('lease_created')
                ->log('lease_created');

            LeaseRenewed::dispatch($parent->fresh(), $child->fresh(), $changes);

            return $child->fresh();
        });
    }

    /**
     * Chaîne complète depuis la racine jusqu'au plus récent. Bornée par
     * MAX_CHAIN_DEPTH * 2 pour éviter une boucle infinie sur des données
     * corrompues — la limite logique (10) n'est imposée qu'à la création.
     */
    public function chain(Lease $node): Collection
    {
        $root = $this->root($node);
        $items = collect([$root]);
        $current = $root;
        $hops = 0;

        while ($hops < self::MAX_CHAIN_DEPTH * 2) {
            $next = Lease::query()
                ->where('renewed_from_lease_id', $current->id)
                ->orderBy('created_at')
                ->first();

            if ($next === null) {
                break;
            }

            $items->push($next);
            $current = $next;
            $hops++;
        }

        return $items;
    }

    public function root(Lease $node): Lease
    {
        $current = $node;
        $hops = 0;
        while ($current->renewed_from_lease_id !== null && $hops < self::MAX_CHAIN_DEPTH * 2) {
            $parent = Lease::find($current->renewed_from_lease_id);
            if ($parent === null) {
                break;
            }
            $current = $parent;
            $hops++;
        }

        return $current;
    }

    public function depth(Lease $node): int
    {
        $depth = 1;
        $current = $node;
        $hops = 0;
        while ($current->renewed_from_lease_id !== null && $hops < self::MAX_CHAIN_DEPTH * 2) {
            $parent = Lease::find($current->renewed_from_lease_id);
            if ($parent === null) {
                break;
            }
            $depth++;
            $current = $parent;
            $hops++;
        }

        return $depth;
    }

    protected function guardParentStatus(Lease $parent): void
    {
        if (! in_array($parent->status, self::RENEWABLE_PARENT_STATUSES, true)) {
            throw ValidationException::withMessages([
                'status' => [__('messages.lease_renewal_status_not_renewable')],
            ])->status(422);
        }
    }

    /**
     * @param  array<string,mixed>  $data
     */
    protected function guardImmutableFields(array $data): void
    {
        $forbidden = array_intersect_key($data, array_flip(['tenant_id', 'property_id', 'landlord_id']));
        if ($forbidden !== []) {
            $field = array_key_first($forbidden);
            throw ValidationException::withMessages([
                $field => [__('messages.lease_renewal_field_immutable', ['field' => $field])],
            ])->status(422);
        }
    }

    protected function guardNoActiveChild(Lease $parent): void
    {
        $activeChild = Lease::query()
            ->where('renewed_from_lease_id', $parent->id)
            ->whereIn('status', [
                LeaseStatus::Active->value,
                LeaseStatus::PendingSignature->value,
                LeaseStatus::Draft->value,
            ])
            ->exists();

        if ($activeChild) {
            throw ValidationException::withMessages([
                'parent' => [__('messages.lease_renewal_active_child_exists')],
            ])->status(422);
        }
    }

    protected function guardMaxChainDepth(Lease $parent): void
    {
        if ($this->depth($parent) >= self::MAX_CHAIN_DEPTH) {
            throw ValidationException::withMessages([
                'parent' => [__('messages.lease_renewal_max_chain_exceeded', ['max' => self::MAX_CHAIN_DEPTH])],
            ])->status(422);
        }
    }

    protected function requireSignatureFlag(): bool
    {
        $row = Setting::query()->where('key', 'lease.require_signature')->first();
        if ($row === null) {
            return false;
        }
        $value = $row->value;
        if (is_array($value)) {
            $value = $value['value'] ?? array_values($value)[0] ?? null;
        }

        return filter_var($value, FILTER_VALIDATE_BOOL);
    }

    /**
     * @return array<string,array{from:mixed,to:mixed}>
     */
    protected function diffChanges(Lease $parent, Lease $child): array
    {
        $tracked = [
            'start_date', 'end_date', 'monthly_rent', 'deposit_amount',
            'late_fee_percent', 'late_fee_grace_days', 'terms', 'special_conditions',
        ];
        $changes = [];

        foreach ($tracked as $field) {
            $from = $parent->{$field};
            $to = $child->{$field};
            if ($from instanceof CarbonInterface) {
                $from = $from->toDateString();
            }
            if ($to instanceof CarbonInterface) {
                $to = $to->toDateString();
            }
            if ((string) $from !== (string) $to) {
                $changes[$field] = ['from' => $from, 'to' => $to];
            }
        }

        return $changes;
    }
}
