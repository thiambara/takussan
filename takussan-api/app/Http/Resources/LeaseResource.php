<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Booking;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\User;
use App\Policies\LeasePolicy;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LandlordSignatory;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Lease\RentReviewService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\MissingValue;

class LeaseResource extends BaseResource
{
    private ?User $viewer = null;

    /**
     * TCK-2780 — le bloc `tenant` du détail : `null` sur la liste (la relation chargée décide,
     * `whenLoaded`), sinon la décision du contrôleur — `inclus` (la requête porte `include=tenant`) et
     * `champs` (`fields[customers]`, ou `null` pour le bloc entier). Jamais l'état de la relation :
     * `LeasePolicy::view` lit `$lease->tenant` pour reconnaître le locataire, ce qui la charge avant le
     * rendu.
     *
     * @var array{inclus: bool, champs: list<string>|null}|null
     */
    private ?array $locataire = null;

    /**
     * TCK-596 §4B — ce que l'utilisateur courant peut faire de la signature : les rôles pour
     * lesquels il signe, et s'il peut lancer la demande. Seulement sur le détail.
     */
    public function forViewer(?User $viewer): static
    {
        $this->viewer = $viewer;

        return $this;
    }

    /**
     * TCK-2780 — le locataire du détail, rendu sous `include=tenant` seulement, et borné aux champs
     * demandés ({@see CustomerResource::borneeAuxChamps()}).
     *
     * @param  list<string>|null  $champs
     */
    public function avecLocataire(bool $inclus, ?array $champs): static
    {
        $this->locataire = ['inclus' => $inclus, 'champs' => $champs];

        return $this;
    }

    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'property_id' => $this->property_id,
            'landlord_id' => $this->landlord_id,
            'tenant_id' => $this->tenant_id,
            'agency_id' => $this->agency_id,
            // TCK-595 (ADR-0049 §1) — le négociateur.
            'agent_id' => $this->agent_id,
            'booking_id' => $this->booking_id,
            'renewed_from_lease_id' => $this->renewed_from_lease_id,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'start_date' => $this->calendarDate($this->start_date),
            'end_date' => $this->calendarDate($this->end_date),
            'renewal_date' => $this->calendarDate($this->renewal_date),
            'monthly_rent' => $this->monthly_rent !== null ? (float) $this->monthly_rent : null,
            // TCK-2679 — les charges mensuelles du bail ; nulles sur un bail antérieur.
            'monthly_charges' => $this->monthly_charges !== null ? (float) $this->monthly_charges : null,
            'sale_price' => $this->sale_price !== null ? (float) $this->sale_price : null,
            'currency' => $this->currency?->value,
            'deposit_amount' => $this->deposit_amount !== null ? (float) $this->deposit_amount : null,
            'deposit_refunded_amount' => $this->deposit_refunded_amount !== null ? (float) $this->deposit_refunded_amount : null,
            'deposit_refunded_at' => $this->iso($this->deposit_refunded_at),
            'deposit_refund_reason' => $this->deposit_refund_reason,
            'commission_rate' => $this->commission_rate !== null ? (float) $this->commission_rate : null,
            // TCK-595 (ADR-0049 §2) — la base du grand livre. Elle était en base et jamais rendue : le
            // formulaire ne pouvait ni la montrer ni vérifier ce qu'il avait envoyé. verif-595 m6 — un
            // terme du mandat de l'agence, rendu à son seul personnel : ni au locataire, ni au bailleur.
            // ⚠ Pas de `when()` : les contrôleurs appellent `toArray()` directement, et la valeur
            // manquante sortirait sérialisée (`[]`) au lieu d'être retirée. La clé est ôtée plus bas.
            'commission_amount' => $this->commission_amount !== null ? (float) $this->commission_amount : null,
            'payment_frequency' => $this->payment_frequency?->value,
            'payment_day' => $this->payment_day,
            // P133.04 (TCK-1381) — la pénalité de retard et son délai de grâce, que le renouvellement
            // reprend du bail d'origine : le dialogue de renouvellement les pré-remplit et les montre.
            'late_fee_percent' => $this->late_fee_percent !== null ? (float) $this->late_fee_percent : null,
            'late_fee_grace_days' => $this->late_fee_grace_days,
            'signed_at' => $this->iso($this->signed_at),
            'terminated_at' => $this->iso($this->terminated_at),
            // TCK-090 — early termination workflow exposed for the dashboard
            // banner / countdown / cancel button. Kept inline rather than
            // gated behind whenLoaded() because the columns are always on
            // the row, so the round-trip cost is zero.
            'early_termination_requested_at' => $this->iso($this->early_termination_requested_at),
            'early_termination_requested_by' => $this->early_termination_requested_by,
            'early_termination_effective_date' => $this->calendarDate($this->early_termination_effective_date),
            'early_termination_penalty_amount' => $this->early_termination_penalty_amount !== null
                ? (float) $this->early_termination_penalty_amount
                : null,
            'early_termination_reason' => $this->early_termination_reason,
            'early_termination_invoice_id' => $this->early_termination_invoice_id,
            'notice_period_days' => $this->notice_period_days,
            // P98.05 — le nombre de mois que la résiliation exécutera (figé sur le bail, sinon le
            // réglage), pour l'estimation du dialogue de demande. Sur le détail seul (`forViewer`) :
            // à défaut de valeur figée, il lit le réglage de l'agence, une requête par bail.
            'early_termination_penalty_months' => $this->when($this->viewer !== null,
                fn (): int => app(EarlyTerminationService::class)->penaltyMonthsFor($this->resource)),
            'property' => $this->whenLoaded('property', fn () => PropertyResource::make($this->property)),
            'tenant' => $this->locataire === null
                ? $this->whenLoaded('tenant', fn () => CustomerResource::make($this->tenant))
                : $this->when($this->locataire['inclus'], fn () => $this->tenant === null
                    ? null
                    : CustomerResource::make($this->tenant)->borneeAuxChamps($this->locataire['champs'])),
            'renewed_from' => $this->whenLoaded('renewedFrom', fn () => self::make($this->renewedFrom)),
            'renewals' => $this->whenLoaded('renewals', fn () => self::collection($this->renewals)),
            'renewals_count' => $this->whenCounted('renewals'),
            // TCK-596 §4B (ADR-0042) — le contrat figé et les preuves de consentement. Jamais l'IP ni
            // l'agent utilisateur : ce sont des pièces de preuve, pas des données d'écran.
            'contract_sha256' => $this->contract_sha256,
            'signature_requested_at' => $this->iso($this->signature_requested_at),
            'signatures' => $this->whenLoaded('signatures', fn () => $this->signatures
                ->sortBy('signed_at')
                ->values()
                ->map(fn (LeaseSignature $s): array => [
                    'id' => $s->id,
                    'role' => $s->role,
                    'method' => $s->method,
                    'signed_at' => $this->iso($s->signed_at),
                    'document_sha256' => $s->document_sha256,
                    'current' => $this->contract_sha256 !== null && $s->document_sha256 === $this->contract_sha256,
                    // TCK-2134 (P220.02) — `nameWithoutContact()` : jamais `''` pour un compte créé
                    // par téléphone. `null` reste réservé à une signature sans mandat.
                    'signer_name' => $s->relationLoaded('signer') ? $s->signer?->nameWithoutContact() : null,
                    'on_behalf_of_name' => $s->relationLoaded('onBehalfOf') ? $s->onBehalfOf?->nameWithoutContact() : null,
                    'otp_channel' => $s->otp_channel,
                ])
                ->all()),
            'can_sign_as' => $this->when($this->viewer !== null, fn (): array => LeaseSignatureService::rolesFor($this->viewer, $this->resource)),
            'can_request_signature' => $this->when($this->viewer !== null, fn (): bool => $this->viewer->can('requestSignature', $this->resource)),
            // VERIF-596 M1 — la voie papier : gestionnaire ET signataire possible pour le bailleur.
            'can_activate_on_paper' => $this->when($this->viewer !== null, fn (): bool => $this->viewer->can('update', $this->resource)
                && LandlordSignatory::allows($this->viewer, $this->resource)),
            // P152.02 — les quatre gestes que `LeasePolicy` juge par capacité, pour que la fiche ne
            // monte que ceux que l'API acceptera. Le statut du bail reste jugé par l'écran et l'API.
            'abilities' => $this->when($this->viewer !== null, fn (): array => [
                'renew' => $this->viewer->can('renew', $this->resource),
                'review_rent' => $this->viewer->can('reviewRent', $this->resource),
                'record_payment' => $this->viewer->can('recordPayment', $this->resource),
                'refund_deposit' => $this->viewer->can('refundDeposit', $this->resource),
                // P189.03 (TCK-1871) — le préavis (et son annulation, même règle), l'ajout de garant
                // et le lien de paiement, que la fiche ouvrait par le rôle : le bailleur suspendu le
                // garde, et l'agent sans `leases.terminate` voyait le préavis.
                'request_early_termination' => $this->viewer->can('requestEarlyTermination', $this->resource),
                'update' => $this->viewer->can('update', $this->resource),
                // TCK-2764 — abandonner le brouillon (`DELETE /api/leases/{id}`) : la règle d'`update` sur un
                // `draft`. Les échéances saisies restent jugées par l'écran et par l'API, sous verrou.
                'abandon' => $this->viewer->can('abandon', $this->resource),
                // TCK-2642 — les quatre gestes que la fiche ouvrait encore par le rôle. `leave_review` et
                // `give_notice` sont des gestes de PARTIE (le locataire) : lus sur la policy, hors de
                // `Gate::before`, qui les accorderait au super-admin.
                'add_document' => $this->viewer->can('addDocument', $this->resource),
                'download_contract' => $this->viewer->can('downloadContract', $this->resource),
                'leave_review' => app(LeasePolicy::class)->leaveReview($this->viewer, $this->resource),
                'give_notice' => app(LeasePolicy::class)->giveNotice($this->viewer, $this->resource),
                // TCK-2645 (décision 3) — « Passer outre » le plafond de révision : la capacité, jugée dans
                // l'agence DU BAIL (le bail en argument : sans lui, la Gate juge l'agence du profil actif),
                // et un plafond NON figé au contrat. Un plafond figé n'est jamais forcé
                // (`RentReviewService::review`, VERIF-596 passe 3) : l'offre suit le refus de l'API.
                // Un bail SANS agence ne donne aucun contexte à la Gate, qui retomberait sur l'agence du
                // profil actif : capacité d'agence, aucun membre ne l'y a — seul le super-admin, qui a
                // tout (`Gate::before`), y passe outre (réserve r1 de la vérification d'eecb6f893).
                'rent_review_force' => ($this->resource->agency_id !== null
                    ? $this->viewer->can('leases.rent_review_force', $this->resource)
                    : $this->viewer->isSuperAdmin())
                    && $this->resource->rent_review_max_pct === null,
            ]),
            // TCK-2764 — la candidature d'où le bail est tiré, et son statut, pour que le dialogue
            // d'abandon propose de la fermer par son geste (`reject` si `pending`, `cancel` si
            // `confirmed`). À qui peut abandonner seulement, sur le détail (`forViewer`) ; `null` quand
            // le bail n'est tiré d'aucune réservation.
            'origin_booking' => $this->when($this->viewer !== null && $this->viewer->can('abandon', $this->resource),
                fn (): ?array => $this->booking_id === null ? null : $this->candidatureDOrigine()),
            // TCK-2764 r1, puis 4a (décision du porteur du 2026-11-13) — un état des lieux ENGAGÉ sur le
            // brouillon (`Inventory::engage()` : sorti du brouillon, ou signé) refuse l'abandon
            // (`lease.abandon_has_inventory`) : la fiche remplace le geste par sa raison. Un brouillon
            // d'état des lieux jamais signé ne compte pas : il part avec le bail. Même lecteur que
            // `origin_booking`.
            'has_inventory' => $this->when($this->viewer !== null && $this->viewer->can('abandon', $this->resource),
                fn (): bool => $this->resource->inventories()->get()->contains(fn (Inventory $etat): bool => $etat->engage())),
            // TCK-2642 — le plafond de révision que CE bail exécute (figé au contrat, sinon le réglage de
            // son agence, sinon le global : `RentReviewService::maxPctFor`), pour la feuille de révision.
            // Sur le détail seul : le réglage d'agence se lit une fois par bail.
            'rent_review_cap_pct' => $this->when($this->viewer !== null,
                fn (): float => app(RentReviewService::class)->maxPctFor($this->resource)),
            'created_at' => $this->iso($this->created_at),
        ];

        if (! $this->viewerIsAgencyStaff($request)) {
            unset($data['commission_amount']);
        }

        // TCK-2642 — les clés calculées pour la page par le contrôleur (`include=attention`,
        // `include=due_summary`) et les parties nommées (`include=landlord`, `include=agent`) :
        // absentes sans l'inclusion. Ajoutées ici et non par `when()` : la liste appelle `toArray()`.
        $data += $this->computedAndParties($request);

        // P21.06 (TCK-904) — le détail appelle `toArray()` directement, qui ne filtre pas les
        // `MissingValue` : une relation de renouvellement non chargée sortait en `{}`.
        foreach (['renewed_from', 'renewals', 'renewals_count'] as $key) {
            if ($data[$key] instanceof MissingValue) {
                unset($data[$key]);
            }
        }

        return $data;
    }

    /**
     * TCK-2642 — `attention[]`, le résumé d'échéance, et les parties nommées par une projection fixe :
     * le bailleur (noms ; téléphone pour le personnel de l'agence du bail et pour le bailleur
     * lui-même, jamais pour le seul locataire, que l'agence sert), l'agent (noms).
     *
     * @return array<string, mixed>
     */
    private function computedAndParties(Request $request): array
    {
        $lease = $this->resource;
        $out = [];
        if (! $lease instanceof Lease) {
            return $out;
        }

        if (($attention = $lease->attentionBlock()) !== null) {
            $out['attention'] = array_map(fn (array $entry): array => array_merge($entry, [
                'since' => $this->calendarDate($entry['since']),
            ], isset($entry['due_date']) ? ['due_date' => $this->calendarDate($entry['due_date'])] : []), $attention);
        }

        if (($due = $lease->dueSummary()) !== null) {
            $out['next_due'] = $due['next_due'] === null ? null
                : ['due_date' => $this->calendarDate($due['next_due']['due_date'])] + $due['next_due'];
            $out['overdue_count'] = $due['overdue_count'];
            $out['overdue_amount'] = $due['overdue_amount'];
        }

        if ($lease->relationLoaded('landlord')) {
            $viewer = $this->viewer ?? $request->user();
            $seesPhone = $viewer instanceof User
                && ($this->viewerIsAgencyStaff($request) || (int) $viewer->id === (int) $lease->landlord_id);
            $out['landlord'] = $this->party($lease->landlord, $seesPhone);
        }
        if ($lease->relationLoaded('agent')) {
            $out['agent'] = $this->party($lease->agent, false);
        }

        return $out;
    }

    /** @return array<string, mixed>|null */
    private function party(?User $user, bool $withPhone): ?array
    {
        if ($user === null) {
            return null;
        }

        return [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'full_name' => $user->nameWithoutContact(),
            ...($withPhone ? ['phone' => $user->phone] : []),
        ];
    }

    /**
     * Le lecteur est-il du personnel de l'agence du bail (ou super-admin) ? Son agence de personnel se
     * lit une fois par requête, pas une fois par ligne d'une liste.
     */
    private function viewerIsAgencyStaff(Request $request): bool
    {
        $viewer = $this->viewer ?? $request->user();
        if (! $viewer instanceof User) {
            return false;
        }
        if ($viewer->isSuperAdmin()) {
            return true;
        }

        $key = 'lease_resource.staff_agency_id.'.$viewer->id;
        if (! $request->attributes->has($key)) {
            $request->attributes->set($key, $viewer->staffAgencyId());
        }
        $staffAgencyId = $request->attributes->get($key);

        return $staffAgencyId !== null && $this->agency_id !== null && (int) $this->agency_id === $staffAgencyId;
    }

    /** @return array{id: int, status: string|null}|null */
    private function candidatureDOrigine(): ?array
    {
        $candidature = Booking::query()->whereKey($this->booking_id)->first(['id', 'status']);

        return $candidature === null ? null : ['id' => $candidature->id, 'status' => $this->enumValue($candidature->status)];
    }
}
