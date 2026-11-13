<?php

namespace App\Services\Model;

use App\Domain\Notifications\NotificationCode;
use App\Events\Booking\BookingClosed;
use App\Events\Lease\LeaseActivated;
use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Booking\BookingNotificationParams;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LeaseExitScheduleService;
use App\Services\Lease\LeaseRenewalService;
use App\Services\Property\ContactDeLAgenceDuBien;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LeaseService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Property $property, User $user, array $data): Lease
    {
        // TCK-587 (ADR-0031) — le bailleur du bien, ou le PERSONNEL de l'agence du bien tenant
        // `leases.create`. TCK-2643 — la règle vit dans `LeasePolicy::createOn()`, que lit aussi
        // `GET /api/leases/defaults` : le préremplissage juge comme la création.
        abort_unless($user->can('createOn', [Lease::class, $property]), 403);

        // TCK-587 (vérification adverse, B2) — le locataire et le garant doivent être dans le
        // périmètre de l'émetteur (`view`), comme le client d'une réservation (`BookingService`).
        // `exists:` seul laissait rattacher le contact de n'importe qui, puis lire sa fiche par
        // le bail.
        // TCK-2285 (P226.01) — et une fiche de l'agence du bien quand il en a une : `view` admet la
        // fiche de A que l'agent de A et de B a ajoutée, sur un bien de B. Même refus.
        $tenant = Customer::query()->find($data['tenant_id'] ?? null);
        abort_unless($tenant !== null && $user->can('view', $tenant)
            && ContactDeLAgenceDuBien::client($tenant, $property->agency_id), 403);
        if (! empty($data['guarantor_id'])) {
            $guarantor = Guarantor::query()->find($data['guarantor_id']);
            abort_unless($guarantor !== null && $user->can('view', $guarantor)
                && ContactDeLAgenceDuBien::garant($guarantor, $property->agency_id), 403);
        }

        // TCK-1068 (P62.01) — la réservation d'origine doit être une réservation DU BIEN. Jugée ici,
        // après l'autorisation du bien, et non par un `exists:` du FormRequest qui répondait à tout
        // compte connecté : une réservation absente et celle d'un autre bien rendent la même erreur.
        $reservation = ! empty($data['booking_id'])
            ? Booking::query()->whereKey((int) $data['booking_id'])->where('property_id', $property->id)->first()
            : null;
        if (! empty($data['booking_id']) && $reservation === null) {
            throw ValidationException::withMessages([
                'booking_id' => [__('validation.exists', ['attribute' => 'booking id'])],
            ]);
        }

        // P48.03 (TCK-2352, décision du porteur du 2026-10-25) — le bail tiré d'une réservation a pour
        // locataire le client de cette réservation : rien ne l'imposait, et le bail d'une candidature
        // pouvait nommer n'importe quelle fiche lisible.
        if ($reservation !== null && (int) $reservation->customer_id !== (int) $tenant->id) {
            throw ValidationException::withMessages([
                'tenant_id' => [__('errors.lease.tenant_not_booking_customer')],
            ]);
        }

        // TCK-595 (verif-595 B1, ADR-0049 §1-§2) — la base de commission et le négociateur sont des
        // termes du mandat de l'agence : seul son personnel les pose, sous `leases.create`. Le
        // bailleur, débiteur de la commission, ne les écrit jamais.
        $this->assertMaySetCommissionTerms($user, $property->agency_id, $data);

        // TCK-595 (ADR-0049 §1) — sans négociateur saisi, le créateur s'il est personnel de l'agence du
        // bien. Un bailleur qui crée son propre bail ne se désigne pas.
        if (! array_key_exists('agent_id', $data)) {
            $data['agent_id'] = PersonnelDeLAgence::estPersonnel($user, $property->agency_id) ? $user->id : null;
        }

        // TCK-595 (ADR-0049 §2) — une vente sans montant naît avec prix × taux. Jamais une location :
        // son `commission_rate` est le taux de gestion des reversements (ADR-0039), un autre flux.
        if (($data['commission_amount'] ?? null) === null
            && self::maySetCommissionTerms($user, $property->agency_id)
            && ($data['type'] ?? null) === LeaseType::Sale->value
            && isset($data['sale_price'], $data['commission_rate'])) {
            $data['commission_amount'] = (float) $data['sale_price'] * (float) $data['commission_rate'] / 100;
        }
        // TCK-1924 (P170.06, décision du porteur) — dérivée ou saisie, la commission s'arrondit à
        // l'unité de la devise du bail : `round(…, 2)` laissait 30 864,18 XOF (ADR-0009).
        $data['commission_amount'] = self::roundCommission($data['commission_amount'] ?? null, $data['currency'] ?? 'XOF');

        return DB::transaction(function () use ($data, $property, $user): Lease {
            // TCK-2747 — sous le verrou du bien, que `BookingService::confirm()` prend aussi : une
            // confirmation de candidature voit le brouillon né ici, ou le précède.
            // TCK-2734 (décision 7 du porteur, 2026-11-12) — le brouillon ne ferme plus rien : les
            // candidatures du bien se closent à l'ENVOI en signature ({@see self::cloreLesCandidaturesDuBien()}).
            Property::query()->whereKey($property->getKey())->lockForUpdate()->first();

            return Lease::create(array_merge($data, [
                'reference_number' => ReferenceNumberGenerator::lease(),
                'landlord_id' => $property->user_id,
                'agency_id' => $property->agency_id ?? $user->agency_id,
                'status' => LeaseStatus::Draft->value,
                'currency' => $data['currency'] ?? 'XOF',
                'payment_frequency' => $data['payment_frequency'] ?? 'monthly',
            ]));
        });
    }

    /**
     * TCK-2734 (décision 7 du porteur, 2026-11-12) — l'ordre global des verrous (`takussan-api/CLAUDE.md`,
     * piège n° 10) pour qui écrit un bail ET les réservations de son bien : le BIEN d'abord, puis la ligne
     * du bail, relue. `PropertyOwnerTransfer` écrit les baux après le bien, et `BookingService::confirm()`
     * les réservations après lui : prendre le bail avant le bien inverserait l'ordre. Dans la transaction
     * de l'appelant.
     *
     * L'AGENCE vient après (réserve r2 de la vérification de d87e423e7) : l'envoi la touche par le journal
     * (clé étrangère `activity_log.agency_id`) et par le compteur de `LeaseObserver`. Ne pas la verrouiller
     * ici en tête : tout écrivain qui tient un bien puis journalise s'interbloquerait avec. C'est l'achat de
     * boost qui a changé d'ordre (`BoostPurchaseService::lock()`, bien puis agence).
     */
    public static function verrouillerLeBienPuisLeBail(Lease $lease): Lease
    {
        Property::query()->whereKey($lease->property_id)->lockForUpdate()->first();

        /** @var Lease */
        return Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
    }

    /**
     * TCK-2734 (décision 7 du porteur, 2026-11-12, contre la recommandation) — les candidatures du bien
     * se closent quand le bail PART : à l'envoi en signature (`LeaseSignatureService::request()`) ou à
     * la signature sur papier (`signOnPaper()`, qui accepte un brouillon), et plus à la création du
     * brouillon. Un brouillon abandonné ne ferme donc rien.
     *
     * - La réservation d'origine (`booking_id`) et les candidatures ouvertes du LOCATAIRE passent
     *   `completed` (P48.03), sans avis.
     * - Les autres candidatures ouvertes (`pending`, `confirmed`) passent `rejected`, avec l'avis
     *   « Candidature non retenue », un par client, après le commit.
     *
     * Un renouvellement ne ferme rien : le locataire reste, le bien n'est pas reloué.
     * Un second envoi (bail déjà `pending_signature`) ne retrouve que ce qui est ouvert depuis le premier.
     *
     * L'appelant tient la transaction et a pris {@see self::verrouillerLeBienPuisLeBail()}.
     */
    public function cloreLesCandidaturesDuBien(Lease $lease, User $by): void
    {
        if ($lease->renewed_from_lease_id !== null) {
            return;
        }

        $reservation = $lease->booking_id !== null
            ? Booking::query()->whereKey($lease->booking_id)->where('property_id', $lease->property_id)->first()
            : null;
        $candidatures = $this->verrouillerLesCandidaturesOuvertes((int) $lease->property_id, $reservation);

        if ($reservation !== null) {
            $this->terminerLaReservation($reservation, $lease, $by);
        }
        $this->fermerLesCandidatures($candidatures, (int) $lease->tenant_id, $lease, $by);
    }

    /**
     * TCK-2734 — les candidatures encore ouvertes du bien (`pending`, `confirmed`) et la réservation
     * d'origine, verrouillées en UNE passe par identifiant croissant, APRÈS le bien. Rend les
     * candidatures hors la réservation d'origine, que {@see self::terminerLaReservation()} traite.
     * Offres d'achat et séjours n'y sont pas : plusieurs offres sur un bien à vendre sont normales, et
     * un séjour a ses nuits.
     *
     * @return Collection<int, Booking>
     */
    private function verrouillerLesCandidaturesOuvertes(int $propertyId, ?Booking $reservation): Collection
    {
        return Booking::query()
            ->where(fn ($q) => $q
                ->where(fn ($q) => $q
                    ->where('property_id', $propertyId)
                    ->where('kind', BookingKind::Application->value)
                    ->whereIn('status', [BookingStatus::Pending->value, BookingStatus::Confirmed->value]))
                ->when($reservation !== null, fn ($q) => $q->orWhere('id', $reservation->getKey())))
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->reject(fn (Booking $b) => $reservation !== null && $b->is($reservation))
            ->values();
    }

    /**
     * TCK-2734 (seconde porte ; décision 7 du 2026-11-12 : à l'envoi du bail) — les autres
     * candidatures ouvertes du bien se ferment, acceptée comprise. Sans cela, une candidature acceptée qu'un bail tiré d'une AUTRE
     * (ou créé sans `booking_id`) laissait `confirmed` retenait le bien, et toute confirmation suivante
     * rendait `409 booking.application_already_accepted`.
     *
     * - Celles du LOCATAIRE du bail sont les siennes, nommées par `booking_id` ou non : `completed`,
     *   comme la réservation d'origine, sans avis — lui dire « non retenue » serait faux.
     * - Les autres passent `rejected` (ce que `reject()` ne fait que d'une demande en attente) ; leur
     *   auteur reçoit « Candidature non retenue » APRÈS le commit, une fois, et `BookingClosed`
     *   (déjà différé au commit) ouvre la tâche de remboursement d'un acompte encaissé.
     *
     * @param  Collection<int, Booking>  $candidatures  verrouillées par {@see self::verrouillerLesCandidaturesOuvertes()}
     */
    private function fermerLesCandidatures(Collection $candidatures, int $tenantId, Lease $lease, User $user): void
    {
        // Vérification adverse de TCK-2734-b — un avis par AUTEUR : un client qui a deux candidatures
        // ouvertes sur le bien lit une fois « non retenue », pas deux. Chaque candidature se ferme.
        $avises = [];
        foreach ($candidatures as $candidature) {
            if ((int) $candidature->customer_id === $tenantId) {
                $this->terminerLaReservation($candidature, $lease, $user);

                continue;
            }

            $candidature->forceFill([
                'status' => BookingStatus::Rejected,
                'cancelled_at' => now(),
            ])->save();
            $candidature->cancelPendingPayments();

            activity('Booking')
                ->performedOn($candidature)
                ->causedBy($user)
                ->withProperties(['lease_id' => $lease->id])
                ->event('booking_not_selected')
                ->log('booking_not_selected');

            $premierAvis = ! isset($avises[(int) $candidature->customer_id]);
            $avises[(int) $candidature->customer_id] = true;

            if ($premierAvis) {
                DB::afterCommit(function () use ($candidature): void {
                    $client = $candidature->customer?->user;
                    if ($client !== null) {
                        app(NotificationService::class)->send(
                            $client,
                            NotificationCode::BookingApplicationNotSelected,
                            BookingNotificationParams::for($candidature, NotificationCode::BookingApplicationNotSelected),
                            BookingNotificationParams::target($candidature),
                        );
                    }
                });
            }
            BookingClosed::dispatch($candidature, BookingClosed::REASON_REJECTED, $user->id);
        }
    }

    /**
     * P48.03 (TCK-2352, décision du porteur du 2026-10-25) — la réservation dont naît le bail passe
     * `completed` : seule `confirmed` bloque des nuits (`PropertyAvailabilityService`), et la
     * candidature retenue gardait les siennes après le bail. Relue sous verrou, comme
     * `CompleteEndedBookingsJob` ; seule une réservation encore ouverte (`pending`, `confirmed`)
     * change : une réservation close (annulée, refusée, expirée, terminée) garde son statut.
     */
    private function terminerLaReservation(Booking $reservation, Lease $lease, User $user): void
    {
        $verrouillee = Booking::query()->whereKey($reservation->getKey())->lockForUpdate()->first();
        if ($verrouillee === null
            || ! in_array($verrouillee->status, [BookingStatus::Pending, BookingStatus::Confirmed], true)) {
            return;
        }

        $verrouillee->forceFill(['status' => BookingStatus::Completed])->save();

        activity('Booking')
            ->performedOn($verrouillee)
            ->causedBy($user)
            ->withProperties(['lease_id' => $lease->id])
            ->event('booking_completed')
            ->log('booking_completed');
    }

    /** TCK-1924 (P170.06) — la commission d'un bail, arrondie à l'unité de sa devise ; nulle reste nulle. */
    public static function roundCommission(mixed $amount, Currency|string|null $currency): ?float
    {
        return $amount === null ? null : Currency::roundAmount((float) $amount, $currency);
    }

    /**
     * Les champs du mandat d'agence (ADR-0049 §1-§2) que seul son personnel écrit.
     *
     * TCK-2286 (P227.01, amendement d'ADR-0049 du 2026-10-25) — `commission_rate` aussi : pour une
     * location, c'est le taux de gestion que le reversement retient (`PayoutCalculator`), et le
     * bailleur le mettait à 0 à la création comme au renouvellement.
     */
    public const COMMISSION_TERMS = ['commission_amount', 'agent_id', 'commission_rate'];

    /**
     * TCK-2679 — les types d'échéance que l'échéancier émet PAR PÉRIODE : le loyer, et les charges du
     * contrat à côté de lui. La sortie et le renouvellement les traitent de même. La pénalité de
     * retard et la révision du loyer restent sur le seul loyer.
     *
     * Le contrôle « échéancier déjà émis » reste sur le seul loyer : une échéance de charges SAISIE à
     * la main (régularisation, toujours permise) ferait sinon taire l'échéancier, comme la caution
     * avant TCK-957 (mesuré : `DepositInstalmentScheduleTest`). Le doublon de charges est fermé
     * période par période ({@see self::chargesAlreadyCalled()}).
     *
     * @var list<string>
     */
    public const SCHEDULED_PERIOD_TYPES = [LeasePaymentType::Rent->value, LeasePaymentType::Charges->value];

    /**
     * TCK-595 (verif-595 B1) — les termes de commission ne s'écrivent que par le personnel
     * de l'agence du bail qui tient `leases.create` (la capacité qui ouvre le bail). Le bailleur et
     * le locataire ne les écrivent jamais. À la création, une valeur nulle vaut absence ; à la
     * modification (`$nullIsWrite`), effacer le négociateur est une écriture.
     *
     * @param  array<string, mixed>  $data
     */
    public function assertMaySetCommissionTerms(User $user, ?int $agencyId, array $data, bool $nullIsWrite = false): void
    {
        $written = array_filter(
            array_intersect_key($data, array_flip(self::COMMISSION_TERMS)),
            static fn ($value) => $nullIsWrite || $value !== null,
        );
        abort_code_if($written !== [] && ! self::maySetCommissionTerms($user, $agencyId), 403, 'lease.commission_forbidden');
    }

    public static function maySetCommissionTerms(User $user, ?int $agencyId): bool
    {
        if ($agencyId === null || $user->staffAgencyId() !== $agencyId) {
            return false;
        }

        $agency = Agency::query()->find($agencyId);

        return $agency !== null && $user->canActAt(Capability::LeasesCreate, $agency);
    }

    public function activate(Lease $lease): Lease
    {
        abort_code_unless(
            $lease->status === LeaseStatus::Draft,
            422,
            'lease.not_draft_activate'
        );

        return $this->completeActivation($lease);
    }

    /**
     * TCK-596 §4B (ADR-0042 §6, §8) — ce que fait toute activation, quelle qu'en soit la voie
     * (service interne, seconde signature par code, signature papier) : `active`, `signed_at`,
     * échéancier, `LeaseActivated`. L'appelant a jugé l'état de départ ; sous transaction, il tient
     * le verrou de la ligne du bail.
     */
    public function completeActivation(Lease $lease): Lease
    {
        // VERIF-596 passe 5 (M-E) — un renouvellement né `pending_signature` relève son parent ICI
        // et non à sa création : coupure de la fin, annulation des échéances du chevauchement,
        // `renewed`. Une échéance réglée entre-temps refuse l'activation (409), transaction annulée.
        $fresh = DB::transaction(function () use ($lease) {
            app(LeaseRenewalService::class)->completeHandOver($lease);

            $lease->update([
                'status' => LeaseStatus::Active,
                'signed_at' => now(),
            ]);

            return $lease->refresh();
        });

        // `afterCommit` : une activation dans la transaction d'une signature n'émet l'échéancier
        // qu'une fois la ligne validée (sans transaction, l'émission est immédiate).
        GenerateLeasePaymentSchedule::dispatch($fresh)->afterCommit();

        // TCK-265 — fan out the welcome notification to the tenant.
        // The event is `ShouldDispatchAfterCommit`, so even if the caller
        // wraps activation in a transaction the listener still sees the
        // committed `status = active` row.
        LeaseActivated::dispatch($fresh);

        return $fresh;
    }

    public function generateSchedule(Lease $lease): int
    {
        return $this->scheduleUnderLock($lease, failIfExists: true);
    }

    /**
     * La même génération, muette quand l'échéancier existe déjà : pour la tâche de file
     * (`GenerateLeasePaymentSchedule`), qu'une génération manuelle concurrente a pu devancer.
     */
    public function generateScheduleIfMissing(Lease $lease): int
    {
        return $this->scheduleUnderLock($lease, failIfExists: false);
    }

    /**
     * VERIF-596 (hors diff, fermé ici) — le contrôle « aucune échéance » se fait sous le verrou de
     * la ligne `leases`, sur le bail relu. Il se faisait avant la transaction : un clic sur
     * `generate-schedule` concurrent de la tâche de renouvellement (ou de l'activation) lisait
     * tous deux zéro échéance, et l'échéancier était créé deux fois.
     *
     * The whole schedule is one transaction: a mid-loop failure must not leave a partial schedule,
     * which the `$existing > 0` guard would then make permanently unrecoverable on retry.
     */
    private function scheduleUnderLock(Lease $lease, bool $failIfExists): int
    {
        return DB::transaction(function () use ($lease, $failIfExists): int {
            /** @var Lease $lease */
            $lease = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            // P46.04 (TCK-957) — l'échéancier existe si le bail a des échéances de loyer dues, celles
            // que cette méthode émet. Compter toutes les lignes faisait d'une caution saisie avant
            // l'activation un échéancier : la tâche se taisait, et le bail n'avait aucun loyer.
            $existing = $lease->payments()
                ->where('payment_type', LeasePaymentType::Rent->value)
                ->where('status', '!=', PaymentStatus::Cancelled->value)
                ->count();
            // L'ordre des contrôles de chaque appelant est conservé : la tâche se tait d'abord sur un
            // échéancier existant, la route refuse d'abord un bail inactif.
            if ($existing > 0 && ! $failIfExists) {
                return 0;
            }
            abort_code_unless($lease->status === LeaseStatus::Active, 422, 'lease.not_active_schedule');
            abort_code_if($existing > 0, 422, 'lease.schedule_exists');

            $start = Carbon::parse($lease->start_date);
            $end = $lease->end_date ? Carbon::parse($lease->end_date) : null;
            $frequency = $lease->payment_frequency ?? PaymentFrequency::Monthly;
            $amount = (float) ($lease->monthly_rent ?? 0);
            $charges = (float) ($lease->monthly_charges ?? 0);
            $paymentDay = $lease->payment_day ?? 1;

            $current = $start->copy()->day(min($paymentDay, $start->daysInMonth));

            if ($current->lt($start)) {
                $current = $this->advancePeriod($current, $frequency);
            }

            $deposits = $this->writeDepositInstalment($lease, $start);
            $count = 0;
            $chargeCount = 0;

            while ($end === null || $current->lte($end)) {
                // P04.01 (TCK-667) — une échéance couvre tous les mois de sa période et les facture
                // chacun : loyer mensuel × mois. La dernière s'arrête au mois de fin du bail.
                $periodStart = $current->copy()->startOfMonth();
                $months = $this->monthsPerPeriod($frequency);
                if ($end !== null) {
                    $months = min($months, (int) $periodStart->diffInMonths($end->copy()->startOfMonth()) + 1);
                }

                $due = [
                    'lease_id' => $lease->id,
                    'payer_id' => $lease->tenant_id,
                    'currency' => $lease->currency?->value ?? 'XOF',
                    'status' => PaymentStatus::Pending,
                    'due_date' => $current->toDateString(),
                    'period_start' => $periodStart->toDateString(),
                    'period_end' => $periodStart->copy()->addMonthsNoOverflow($months - 1)->endOfMonth()->toDateString(),
                ];

                LeasePayment::create($due + [
                    'reference_number' => ReferenceNumberGenerator::leasePayment(),
                    'payment_type' => LeasePaymentType::Rent->value,
                    'amount' => $amount * $months,
                ]);

                // TCK-2679 (ADR-0100 § 6) — les charges du contrat, appelées à côté du loyer : même
                // échéance, même période, charges mensuelles × mois. Aucune sans charges posées, ni
                // sur une période dont les charges sont déjà appelées.
                if ($charges > 0 && ! $this->chargesAlreadyCalled($lease, $due['period_start'])) {
                    LeasePayment::create($due + [
                        'reference_number' => ReferenceNumberGenerator::leasePayment(),
                        'payment_type' => LeasePaymentType::Charges->value,
                        'amount' => $charges * $months,
                    ]);
                    $chargeCount++;
                }

                $count++;
                $current = $this->advancePeriod($current, $frequency);

                // Safety cap to avoid infinite loop when end_date is null
                if ($end === null && $count >= 12) {
                    break;
                }
            }

            return $count + $chargeCount + $deposits;
        });
    }

    /**
     * TCK-2679 — une échéance de charges encore vivante (non annulée) commence déjà à cette période :
     * l'échéancier ne l'appelle pas une seconde fois (régénération après des loyers annulés un à un,
     * charges saisies à la main pour ce mois).
     */
    private function chargesAlreadyCalled(Lease $lease, string $periodStart): bool
    {
        return $lease->payments()
            ->where('payment_type', LeasePaymentType::Charges->value)
            ->where('status', '!=', PaymentStatus::Cancelled->value)
            ->whereDate('period_start', $periodStart)
            ->exists();
    }

    /**
     * TCK-2375 (P04.10, ADR-0039, amendement du 2026-10-25 sur la caution) — l'échéancier écrit
     * l'échéance de caution : `deposit_amount`, due au début du bail. Sans elle, aucun chemin
     * n'écrivait de caution (la saisie la refuse depuis TCK-1920), et la restitution, bornée à la
     * caution encaissée, ne rendait rien. Aucune pour un bail sans caution ; aucune pour un renouvellement, dont la caution
     * reste celle du bail d'origine (`Lease::collectedDeposit` lit la chaîne) ; aucune seconde quand
     * le bail en porte déjà une (régénération, ligne antérieure à TCK-1920). Rend 1 si elle est écrite.
     */
    private function writeDepositInstalment(Lease $lease, Carbon $start): int
    {
        $deposit = (float) ($lease->deposit_amount ?? 0);
        if ($deposit <= 0 || $lease->renewed_from_lease_id !== null) {
            return 0;
        }

        $exists = $lease->payments()
            ->where('payment_type', LeasePaymentType::Deposit->value)
            ->where('status', '!=', PaymentStatus::Cancelled->value)
            ->exists();
        if ($exists) {
            return 0;
        }

        LeasePayment::create([
            'lease_id' => $lease->id,
            'reference_number' => ReferenceNumberGenerator::leasePayment(),
            'payer_id' => $lease->tenant_id,
            'payment_type' => LeasePaymentType::Deposit->value,
            'amount' => $deposit,
            'currency' => $lease->currency?->value ?? 'XOF',
            'status' => PaymentStatus::Pending,
            'due_date' => $start->toDateString(),
            'period_start' => $start->toDateString(),
            'period_end' => $start->toDateString(),
        ]);

        return 1;
    }

    private function monthsPerPeriod(PaymentFrequency $frequency): int
    {
        return match ($frequency) {
            PaymentFrequency::Monthly => 1,
            PaymentFrequency::Quarterly => 3,
            PaymentFrequency::Yearly => 12,
        };
    }

    private function advancePeriod(Carbon $date, PaymentFrequency $frequency): Carbon
    {
        return match ($frequency) {
            PaymentFrequency::Monthly => $date->addMonth(),
            PaymentFrequency::Quarterly => $date->addMonths(3),
            PaymentFrequency::Yearly => $date->addYear(),
        };
    }

    /**
     * TCK-2764 (décision du porteur du 2026-11-12) — abandonner un brouillon jamais envoyé en signature :
     * suppression DOUCE. La ligne reste (`deleted_at`), avec sa candidature d'origine, ses garants et
     * ses documents ; elle cesse d'occuper le bien, parce que `BookingService::bauxQuiOccupent()` part
     * de `Lease::query()`, qui écarte les lignes supprimées. Aucune candidature ne bouge — la fermer est
     * un second geste, celui de l'écran (`reject` ou `cancel` de la réservation).
     *
     * Le bien puis le bail (`verrouillerLeBienPuisLeBail()`), comme l'envoi en signature : de deux
     * ordres concurrents, le second relit la ligne. Un envoi passé d'abord laisse `pending_signature`
     * (422 ci-dessous) ; un abandon passé d'abord laisse une ligne supprimée, que l'envoi ne trouve plus
     * (404).
     *
     * Une échéance non annulée, de tout type, refuse l'abandon : de l'argent saisi ne disparaît pas
     * avec un brouillon. Un état des lieux aussi (`lease.abandon_has_inventory`) : il resterait orphelin.
     */
    public function abandonDraft(Lease $lease, User $by, ?string $reason = null): Lease
    {
        return DB::transaction(function () use ($lease, $by, $reason): Lease {
            $locked = self::verrouillerLeBienPuisLeBail($lease);

            abort_code_if($locked->status !== LeaseStatus::Draft, 422, 'lease.not_draft_abandon');
            abort_code_if(
                $locked->payments()->where('status', '!=', PaymentStatus::Cancelled->value)->exists(),
                422,
                'lease.abandon_has_payments'
            );
            // TCK-2764 r1 (décision du 2026-11-13) — un état des lieux, signé ou non, refuse aussi l'abandon :
            // aucune route ne le supprime, et il restait sans bail (`lease: null`) dans la liste.
            // `InventoryService::create()` prend le même bien puis le même bail : de deux ordres
            // concurrents, le second voit l'autre.
            abort_code_if($locked->inventories()->exists(), 422, 'lease.abandon_has_inventory');

            $locked->delete();

            activity('Lease')
                ->performedOn($locked)
                ->causedBy($by)
                ->withProperties([
                    'lease_id' => $locked->id,
                    'property_id' => $locked->property_id,
                    'booking_id' => $locked->booking_id,
                    'reason' => $reason,
                ])
                ->event('lease_draft_abandoned')
                ->log('lease_draft_abandoned');

            return $locked;
        });
    }

    public function terminate(Lease $lease, User $user, ?string $reason = null): Lease
    {
        // The status flip and the penalty charge must commit together: if the
        // penalty insert failed after the status update, the lease would be
        // Terminated with no penalty and the charge could never be re-applied
        // (it's no longer Active).
        return DB::transaction(function () use ($lease, $user, $reason): Lease {
            // VERIF-596 passe 4 (m-c) — statut et indemnité se jugent sur la ligne VERROUILLÉE : sur
            // l'instance liée, une activation validée entre-temps laissait résilier un bail actif
            // sans indemnité.
            /** @var Lease $locked */
            $locked = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless(
                in_array($locked->status, [LeaseStatus::Active, LeaseStatus::PendingSignature], true),
                422,
                'lease.cannot_terminate'
            );

            // VERIF-596 passe 4 (M-T, ADR-0042 §1) — l'indemnité est celle que le contrat imprime :
            // même règle que la voie formelle (`computePenalty`), le terme figé borné aux mois
            // restants. Avant : `min(mois restants, 3)` loyers en dur, quel que soit le contrat
            // signé. Un bail en attente de signature n'est pas en vigueur : aucune indemnité.
            $penaltyAmount = $locked->status === LeaseStatus::Active
                ? app(EarlyTerminationService::class)->computePenalty($locked, now())
                : 0.0;

            // TCK-1151 (P81.01) — les loyers dont la période commence après aujourd'hui ne sont plus
            // dus ; un loyer postérieur déjà engagé fait refuser la résiliation (409).
            app(LeaseExitScheduleService::class)->cancelAfterExit($locked, now()->startOfDay(), $user);

            $locked->update([
                'status' => LeaseStatus::Terminated,
                'terminated_at' => now(),
                'terminated_by_id' => $user->id,
                'termination_reason' => $reason,
            ]);

            if ($penaltyAmount > 0) {
                LeasePayment::create([
                    'lease_id' => $locked->id,
                    'reference_number' => ReferenceNumberGenerator::leasePayment(),
                    'payer_id' => $locked->tenant_id,
                    'payment_type' => LeasePaymentType::Penalty->value,
                    'amount' => $penaltyAmount,
                    'currency' => $locked->currency?->value ?? 'XOF',
                    'status' => PaymentStatus::Pending,
                    'due_date' => now()->addDays(30)->toDateString(),
                    'period_start' => now()->toDateString(),
                    'period_end' => now()->addDays(30)->toDateString(),
                ]);
            }

            return $locked->refresh();
        });
    }
}
