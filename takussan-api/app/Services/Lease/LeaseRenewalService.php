<?php

namespace App\Services\Lease;

use App\Events\Lease\LeaseRenewed;
use App\Exceptions\ApiError;
use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Model\ReferenceNumberGenerator;
use App\Services\Payments\PaymentGatewayService;
use App\Support\ScopedSetting;
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

    /** VERIF-596 passe 5 (M-E) — les échéances ouvertes sans aucun règlement, annulables. */
    public const CANCELLABLE_DUE_STATUSES = [PaymentStatus::Pending, PaymentStatus::Late, PaymentStatus::Failed];

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
            //
            // VERIF-596 passe 6 (m-j) — `FOR NO KEY UPDATE`, pas `FOR UPDATE` : il sérialise de même
            // les `renew` et les autres écritures du bail, mais ne bloque pas le `FOR KEY SHARE` du
            // contrôle de clé étrangère qu'un webhook pose en mettant à jour une échéance qu'il tient
            // déjà. Avec `FOR UPDATE`, les deux ordres (bail → échéances, échéance → bail) formaient un
            // cycle : 3 interblocages sur 8 en course réelle.
            $parent = Lease::query()->lock('for no key update')->findOrFail($parent->id);

            $this->guardParentStatus($parent);
            $this->guardNoActiveChild($parent);
            $this->guardMaxChainDepth($parent);

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

            $child = new Lease([
                'property_id' => $parent->property_id,
                'landlord_id' => $parent->landlord_id,
                'tenant_id' => $parent->tenant_id,
                'agency_id' => $parent->agency_id,
                'guarantor_id' => $parent->guarantor_id,
                'renewed_from_lease_id' => $parent->id,
                'reference_number' => ReferenceNumberGenerator::lease(),
                'type' => $parent->type,
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
                // VERIF-596 passe 3 (N1', ADR-0042 §1) — les termes d'exécution figés avec le contrat
                // du parent passent à l'enfant comme les autres termes imprimés. Sans eux, un enfant
                // né `active` (sans signature) exécutait le réglage global relu au jour J, à l'encontre
                // du contrat signé. Un parent antérieur (colonnes nulles) donne un enfant nul.
                'early_termination_penalty_months' => $data['early_termination_penalty_months'] ?? $parent->early_termination_penalty_months,
                'rent_review_max_pct' => $data['rent_review_max_pct'] ?? $parent->rent_review_max_pct,
                'terms' => $data['terms'] ?? $parent->terms,
                'special_conditions' => $data['special_conditions'] ?? $parent->special_conditions,
            ]);

            // VERIF-596 passe 4 (m-d, ADR-0042 §1) — un renouvellement qui CHANGE un terme qu'un
            // contrat figé a fait signer est un avenant : il naît `pending_signature`, quel que soit
            // le réglage, et ne s'exécute qu'une fois signé (par code ou sur papier). Sans cela, un
            // renouvellement à J+1 portait le loyer à +50 % (ou l'indemnité à 12 mois) dès le
            // lendemain, sans le locataire. Sans changement de terme, ou sur un parent antérieur,
            // le réglage décide comme avant.
            $requireSignature = $this->requireSignatureFlag($parent->agency_id) // TCK-600 (verif-600 H1)
                || ($this->isFrozen($parent) && $this->changesSignedTerms($parent, $child));
            $childStatus = $requireSignature ? LeaseStatus::PendingSignature : LeaseStatus::Active;
            // VERIF-596 passe 5 (M-E) — une échéance du parent déjà réglée dans le chevauchement
            // refuse le renouvellement, avant toute écriture (rejoué à l'activation d'un enfant en
            // attente : un règlement a pu arriver entre-temps).
            $this->assertNoSettledOverlap($parent, $startDate);

            $child->forceFill([
                'status' => $childStatus,
                'signed_at' => $childStatus === LeaseStatus::Active ? now() : null,
            ])->save();

            // VERIF-596 passe 5 (M-E) — le parent ne cède sa place qu'à un enfant EN VIGUEUR. Un
            // enfant `pending_signature` laisse le parent `active`, avec sa fin et son échéancier :
            // un locataire qui ne signe pas garde son bail. La relève se fait à l'activation
            // ({@see self::completeHandOver()}).
            if ($childStatus === LeaseStatus::Active) {
                $this->handOver($parent, $child, $actor);
            }

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

            // TCK-596 — un enfant qui naît `active` produit son échéancier, comme une activation,
            // après validation de la transaction : sans lui, ni relance ni pénalité tant que
            // personne ne cliquait « générer l'échéancier ». Un enfant `pending_signature` le reçoit
            // à son activation par signature. Pas de `LeaseActivated` ici (coordination TCK-595).
            if ($childStatus === LeaseStatus::Active) {
                GenerateLeasePaymentSchedule::dispatch($child->fresh())->afterCommit();
            }

            return $child->fresh();
        });
    }

    /**
     * VERIF-596 passe 5 (M-E) — à l'activation d'un enfant né `pending_signature`, la relève que
     * `renew` a reportée. L'appelant tient le verrou de la ligne de l'enfant ; le parent est
     * verrouillé ici (enfant puis parent : aucune voie ne prend l'ordre inverse, `renew` refusant
     * un second enfant ouvert).
     *
     * VERIF-596 passe 6 (M-F) — un parent qui n'est plus relevable (en préavis, résilié) REFUSE
     * l'activation : 409 `lease.renewal_parent_not_renewable`, la règle même de `renew`. L'activer
     * quand même faisait facturer chaque mois restant deux fois, par le parent et par l'enfant. Le
     * recours est de résilier ce renouvellement, puis d'en créer un autre si besoin ; le préavis et
     * la résiliation du parent restent ouverts (le locataire doit pouvoir partir). Seul un parent
     * déjà `renewed` passe sans relève : il l'a été par cet enfant lui-même, à sa création, avant
     * cette règle (`renew` refuse un second enfant ouvert).
     */
    public function completeHandOver(Lease $child): void
    {
        if ($child->renewed_from_lease_id === null) {
            return;
        }

        // `FOR NO KEY UPDATE` : même raison que dans `renew` (m-j).
        $parent = Lease::query()->whereKey($child->renewed_from_lease_id)->lock('for no key update')->firstOrFail();
        if ($parent->status === LeaseStatus::Renewed) {
            return;
        }
        abort_code_unless(
            in_array($parent->status, self::RENEWABLE_PARENT_STATUSES, true),
            409,
            'lease.renewal_parent_not_renewable',
        );

        $this->assertNoSettledOverlap($parent, Carbon::parse($child->start_date));
        $this->handOver($parent, $child, null);
    }

    /**
     * La relève du parent par un enfant en vigueur, sous le verrou du parent :
     * - continuité des dates (TCK-089) : un chevauchement ramène la fin du parent à la veille du
     *   début de l'enfant ;
     * - VERIF-596 passe 5 (M-E) : les échéances de loyer du parent encore dues à partir du début
     *   de l'enfant passent `cancelled`, tracées ; l'échéancier de l'enfant les remplace. Avant,
     *   chaque mois du chevauchement était facturé deux fois, pénalités de retard comprises ;
     * - le parent passe `renewed`.
     */
    protected function handOver(Lease $parent, Lease $child, ?User $actor): void
    {
        $startDate = Carbon::parse($child->start_date);
        $parentStart = $parent->start_date ? Carbon::parse($parent->start_date) : null;
        $parentEnd = $parent->end_date ? Carbon::parse($parent->end_date) : null;

        $attributes = ['status' => LeaseStatus::Renewed];
        if ($parentEnd !== null && $startDate->lt($parentEnd)) {
            $adjusted = $startDate->copy()->subDay();
            if ($parentStart !== null && $adjusted->lt($parentStart)) {
                $adjusted = $parentStart->copy();
            }
            $attributes['end_date'] = $adjusted;
        }

        $cancelled = [];
        foreach ($this->overlappingRentDues($parent, $startDate) as $due) {
            if (in_array($due->status, self::CANCELLABLE_DUE_STATUSES, true)) {
                $due->update(['status' => PaymentStatus::Cancelled]);
                $cancelled[] = $due->reference_number;
            }
        }

        $parent->forceFill($attributes)->save();

        if ($cancelled !== []) {
            activity('Lease')
                ->performedOn($parent)
                ->causedBy($actor)
                ->withProperties(['child_id' => $child->id, 'cancelled' => $cancelled])
                ->event('lease_renewal_schedule_cancelled')
                ->log('lease_renewal_schedule_cancelled');
        }
    }

    /**
     * VERIF-596 passe 5 (M-E) — une échéance du chevauchement déjà engagée ne s'annule pas en
     * silence : réglée, en partie réglée, pénalité payée, ou paiement en ligne en cours. 409, avec
     * les échéances en cause ; le remboursement reste un geste humain.
     */
    protected function assertNoSettledOverlap(Lease $parent, CarbonInterface $startDate): void
    {
        $engaged = $this->overlappingRentDues($parent, $startDate)
            ->filter(fn (LeasePayment $due) => $this->isEngaged($due))
            ->map(fn (LeasePayment $due) => [
                'id' => $due->id,
                'reference_number' => $due->reference_number,
                'due_date' => $due->due_date?->toDateString(),
                'status' => $due->status instanceof PaymentStatus ? $due->status->value : $due->status,
            ])
            ->values()
            ->all();

        if ($engaged !== []) {
            throw (new ApiError(409, 'lease.renewal_overlaps_paid_schedule'))->with(['payments' => $engaged]);
        }
    }

    /**
     * Les échéances de loyer du parent dues à partir du début de l'enfant : celles que l'échéancier
     * de l'enfant (premier terme ≥ son début) facture à nouveau. Vaut pour un parent sans fin.
     *
     * @return Collection<int, LeasePayment>
     */
    protected function overlappingRentDues(Lease $parent, CarbonInterface $startDate): Collection
    {
        return LeasePayment::query()
            ->where('lease_id', $parent->id)
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->whereDate('due_date', '>=', $startDate->toDateString())
            ->orderBy('due_date')
            ->lockForUpdate()
            ->get();
    }

    protected function isEngaged(LeasePayment $due): bool
    {
        if (in_array($due->status, [PaymentStatus::Paid, PaymentStatus::PartiallyPaid], true)
            || (float) $due->paid_amount > 0
            || $due->late_fee_paid_at !== null) {
            return true;
        }

        // Un paiement en ligne OUVERT sur l'échéance (la définition du dépôt : TCK-593) : le
        // locataire est en train de payer. Confirmé après coup sur une échéance annulée, un
        // règlement est marqué double encaissement, à rembourser (`PaymentGatewayService`).
        return app(PaymentGatewayService::class)->openCheckout($due) !== null;
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

    /**
     * Les termes imprimés qu'un renouvellement peut renégocier (`RenewLeaseRequest`), hors les dates :
     * un renouvellement les change toujours, c'est son objet.
     */
    public const RENEGOTIABLE_SIGNED_TERMS = [
        'monthly_rent', 'deposit_amount', 'late_fee_percent', 'late_fee_grace_days',
        'early_termination_penalty_months', 'rent_review_max_pct', 'terms', 'special_conditions',
    ];

    /** Le parent a un contrat figé, ou des termes d'exécution figés (voie papier, bail signé). */
    protected function isFrozen(Lease $parent): bool
    {
        return $parent->contract_sha256 !== null
            || $parent->early_termination_penalty_months !== null
            || $parent->rent_review_max_pct !== null;
    }

    /** Comparés après cast, comme `diffChanges` : `150000` et `"150000.00"` sont le même loyer. */
    protected function changesSignedTerms(Lease $parent, Lease $child): bool
    {
        foreach (self::RENEGOTIABLE_SIGNED_TERMS as $field) {
            if ((string) $parent->{$field} !== (string) $child->{$field}) {
                return true;
            }
        }

        return false;
    }

    protected function requireSignatureFlag(?int $agencyId = null): bool
    {
        $row = ScopedSetting::row('lease.require_signature', $agencyId); // TCK-600 (verif-600 H1)
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
            'early_termination_penalty_months', 'rent_review_max_pct',
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
