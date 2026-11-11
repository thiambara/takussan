<?php

namespace App\Jobs;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Jobs\Concerns\AlertsOnFirstFailure;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\Sms\DeferredSmsGuard;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Property\PrimaryPropertyContact;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Relances d'échéances de loyer — chaque jour à 08:00 (`routes/console.php`).
 *
 * TCK-588 (ADR-0032) — ce que le job faisait mal, et ce qu'il fait :
 *
 *   · **Sélection.** Une échéance OUVERTE (`pending`, `partially_paid`, `late`), jamais le seul
 *     statut `late` : ce statut n'est écrit que par la pénalité (`LateFeeCalculator`), donc un
 *     bail sans pénalité n'était jamais relancé, et un bail à délai de grâce manquait J+1.
 *     J-3 sur `due_date = today + 3` ; retard sur `due_date ∈ {today - 1, today - 7}`. Un jalon
 *     manqué se rattrape pendant `CATCH_UP_DAYS` jours (TCK-739).
 *   · **Montant.** Le solde (`remaining_amount`), pas `amount` — une échéance partiellement
 *     payée annonçait la somme entière.
 *   · **Jours.** `(int) due_date->diffInDays(now(), true)`. Carbon 3 rend `diffInDays` SIGNÉ et
 *     FLOTTANT : la forme d'avant annonçait « en retard de -7.33 jour(s) ».
 *   · **Destinataires.** Le locataire, avec ou sans compte ({@see ContactSansCompte}) ; le
 *     bailleur (`overdue_landlord`) ; l'agent, UN récapitulatif par jour (`overdue_digest`).
 *   · **Pas de doublon.** Un marqueur par jalon dans `metadata`, posé sous verrou de ligne
 *     comme `SendPropertyVisitReminders` : un second passage le même jour n'envoie rien.
 *
 * TCK-2679 (ADR-0100 § 6) — les charges du bail sont appelées à côté du loyer, à la même date : les
 * échéances d'un même bail et d'une même date partent dans UNE relance, pour leur solde cumulé. Un
 * locataire ne reçoit pas deux messages le même jour pour un même terme.
 */
class SendLeasePaymentReminders implements ShouldQueue
{
    use AlertsOnFirstFailure, Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** @var list<PaymentStatus> */
    public const OPEN_STATUSES = [PaymentStatus::Pending, PaymentStatus::PartiallyPaid, PaymentStatus::Late];

    public const DUE_SOON_DAYS = 3;

    /** @var list<int> */
    public const OVERDUE_DAYS = [1, 7];

    /**
     * TCK-739 (P05.02) — un jalon manqué (job arrêté le jour prévu) part encore jusqu'à ce nombre
     * de jours après, une seule fois grâce à son marqueur. Au-delà, il est perdu.
     */
    public const CATCH_UP_DAYS = 3;

    public function handle(NotificationService $notifications): void
    {
        foreach ($this->claim(now()->addDays(self::DUE_SOON_DAYS), 'due_soon') as $dues) {
            $payment = $dues[0];
            $this->notifyTenant($notifications, $dues, NotificationCode::LeasePaymentDueSoon, [
                'amount' => $this->remaining($dues),
                'due_date' => $payment->due_date?->toDateString(),
                'property' => $payment->lease?->property?->title,
            ] + $this->detail($dues));
        }

        /** @var array<int, array{agent: User, count: int, total: float, currency: ?Currency}> $digests */
        $digests = [];
        foreach (self::OVERDUE_DAYS as $offset) {
            foreach ($this->claim(now()->subDays($offset), "overdue_{$offset}") as $dues) {
                $payment = $dues[0];
                $days = (int) $payment->due_date->diffInDays(now(), true);
                $lease = $payment->lease;
                $amount = $this->remaining($dues);
                $detail = $this->detail($dues);

                $this->notifyTenant($notifications, $dues, NotificationCode::LeasePaymentOverdue, [
                    'amount' => $amount,
                    'days' => $days,
                    'due_date' => $payment->due_date->toDateString(),
                    'property' => $lease?->property?->title,
                ] + $detail);

                $landlord = $lease?->landlord;
                if ($landlord) {
                    $notifications->send($landlord, NotificationCode::LeasePaymentOverdueLandlord, [
                        'amount' => $amount,
                        'days' => $days,
                        'property' => $lease->property?->title,
                        'tenant' => trim(($lease->tenant?->first_name ?? '').' '.($lease->tenant?->last_name ?? '')),
                    ] + $detail, NotificationTarget::of('lease', $lease->id), agencyId: self::agenceDuBail($lease));
                }

                // L'agent : le contact principal du bien, quand ce n'est pas le bailleur lui-même.
                $agent = $lease?->property ? PrimaryPropertyContact::for($lease->property) : null;
                if ($agent && $agent->id !== $landlord?->id) {
                    $digests[$agent->id] ??= ['agent' => $agent, 'count' => 0, 'total' => 0.0, 'currency' => $payment->currency];
                    // Le récapitulatif compte des ÉCHÉANCES : une relance fusionnée (TCK-2679) en porte
                    // plusieurs.
                    $digests[$agent->id]['count'] += count($dues);
                    $digests[$agent->id]['total'] += (float) $amount['amount'];
                }
            }
        }

        foreach ($digests as $digest) {
            $notifications->send($digest['agent'], NotificationCode::LeasePaymentOverdueDigest, [
                'count' => $digest['count'],
                'total' => NotificationRenderer::money($digest['total'], $digest['currency']),
            ], NotificationTarget::of('payments'));
        }
    }

    /**
     * Les échéances ouvertes dont le jalon tombait aujourd'hui (`$dueDate`) ou dans les
     * `CATCH_UP_DAYS` jours précédents (TCK-739), et pas encore relancées pour ce jalon.
     *
     * TCK-740 (P05.03) — rendues UNE À UNE, chacune réservée sous verrou de ligne juste avant
     * d'être rendue : deux passages concurrents ne relancent pas deux fois la même échéance, et
     * un envoi qui lève ne laisse pas marquées, sans envoi, celles qui le suivent.
     *
     * TCK-2679 — rendues PAR GROUPE d'un même bail et d'une même date (le loyer et ses charges) :
     * chaque échéance du groupe est réservée sous son verrou, puis le groupe des réservées part dans
     * une seule relance. Le loyer passe en tête : c'est lui que porte le lien de paiement.
     *
     * @return \Generator<int, non-empty-list<LeasePayment>>
     */
    private function claim(CarbonInterface $dueDate, string $milestone): \Generator
    {
        $key = "reminder_{$milestone}_sent_at";
        // TCK-594 (VERIF-594 passe 4, P4-7) — une caution rendue est due AU locataire : il n'en est
        // pas relancé.
        // TCK-2375 (P04.10) — l'échéance de caution non plus : aucun texte de relance de caution
        // n'existe, et ceux du loyer lui annonceraient « Votre loyer de… ».
        $candidates = LeasePayment::query()
            ->exceptDepositRefunds()
            ->where('payment_type', '!=', LeasePaymentType::Deposit->value)
            ->whereIn('status', self::OPEN_STATUSES)
            ->whereDate('due_date', '<=', $dueDate->toDateString())
            ->whereDate('due_date', '>=', $dueDate->copy()->subDays(self::CATCH_UP_DAYS)->toDateString())
            ->with([
                'lease.tenant.user',
                'lease.landlord',
                ...array_map(fn (string $relation) => "lease.property.{$relation}", PrimaryPropertyContact::eagerLoads()),
            ])
            ->orderBy('id')
            ->get();

        $groups = $candidates->groupBy(fn (LeasePayment $payment) => $payment->lease_id.'|'.$payment->due_date?->toDateString());

        foreach ($groups as $group) {
            $claimed = $group
                ->filter(fn (LeasePayment $payment) => $this->claimOne($payment, $key))
                ->sortBy(fn (LeasePayment $payment) => $payment->payment_type === LeasePaymentType::Rent ? 0 : 1)
                ->values()
                ->all();

            if ($claimed !== []) {
                yield $claimed;
            }
        }
    }

    private function claimOne(LeasePayment $payment, string $key): bool
    {
        return DB::transaction(function () use ($payment, $key): bool {
            $locked = LeasePayment::query()->whereKey($payment->id)->lockForUpdate()->first();
            if (! $locked
                || ! in_array($locked->status, self::OPEN_STATUSES, true)
                || ! empty(($locked->metadata ?? [])[$key])
            ) {
                return false;
            }
            $locked->forceFill(['metadata' => [...($locked->metadata ?? []), $key => now()->toIso8601String()]])->saveQuietly();
            // Le statut et le solde relus sous le verrou, les relations gardées.
            $payment->setRawAttributes($locked->getAttributes(), true);

            return true;
        });
    }

    /**
     * Le solde cumulé des échéances relancées ensemble (TCK-2679).
     *
     * @param  non-empty-list<LeasePayment>  $dues
     * @return array{amount: string, currency: string}
     */
    private function remaining(array $dues): array
    {
        $total = array_sum(array_map(fn (LeasePayment $due) => $this->dueAmount($due), $dues));

        return NotificationRenderer::money(Currency::roundAmount($total, $dues[0]->currency), $dues[0]->currency);
    }

    /**
     * TCK-2706 (voie 2 du porteur, 2026-11-11) — le détail d'une relance qui porte des charges : le
     * solde du loyer (`rent`) et celui des charges (`charges`), qui font choisir le texte « loyer et
     * charges » ou « charges » ({@see NotificationCode::variant()}). Vide — le texte du loyer
     * d'aujourd'hui, octet pour octet — pour un loyer seul, et pour un groupe qui porte autre chose
     * que le loyer et les charges, ou deux échéances d'un même type : ces textes ne sauraient pas le
     * dire, ni la relance donner un lien à chacune.
     *
     * @param  non-empty-list<LeasePayment>  $dues
     * @return array<string, array{amount: string, currency: string}>
     */
    private function detail(array $dues): array
    {
        $byType = [];
        foreach ($dues as $due) {
            $type = $due->payment_type;
            if (! in_array($type, [LeasePaymentType::Rent, LeasePaymentType::Charges], true) || isset($byType[$type->value])) {
                return [];
            }
            $byType[$type->value] = $due;
        }
        if (! isset($byType[LeasePaymentType::Charges->value])) {
            return [];
        }

        $detail = [];
        foreach ($byType as $type => $due) {
            $detail[$type] = NotificationRenderer::money($this->dueAmount($due), $due->currency);
        }

        return $detail;
    }

    /**
     * Le solde d'une échéance arrondi à l'unité de sa devise, AVANT toute somme — la règle de
     * `PaymentGatewayService::amountDue()` (TCK-593), donc ce que son lien encaissera. Sommer les
     * soldes bruts puis arrondir annonçait 650 001 pour deux liens qui encaissent 500 001 + 150 001
     * (vérification adverse de TCK-2706, d1).
     */
    private function dueAmount(LeasePayment $due): float
    {
        return Currency::roundAmount((float) $due->remaining_amount, $due->currency);
    }

    /**
     * Le locataire : son compte, sinon son téléphone (contact sans compte), sinon personne —
     * journalisé, sans exception. Un compte sans téléphone vérifié reçoit en plus le canal mobile
     * au numéro de sa fiche (TCK-1493).
     *
     * TCK-2706 (voie 2 du porteur, 2026-11-11) — le contact sans compte d'une relance qui porte les
     * charges reçoit le lien de CHAQUE échéance : `payment_url` celui du loyer (ou des charges seules),
     * `charges_url` celui des charges. Tous ou aucun : le SMS annonce chaque montant, et un montant
     * annoncé sans son lien ne se paierait pas par le message.
     *
     * @param  non-empty-list<LeasePayment>  $dues  le loyer en tête ({@see claim()})
     * @param  array<string, mixed>  $params
     */
    private function notifyTenant(NotificationService $notifications, array $dues, NotificationCode $code, array $params): void
    {
        $payment = $dues[0];
        $lease = $payment->lease;
        $tenant = $lease?->tenant;
        $target = $lease ? NotificationTarget::of('lease', $lease->id) : null;
        // P203.01 (TCK-2161) — les SMS et WhatsApp d'un bail partent par l'intégration de son agence.
        $agencyId = self::agenceDuBail($lease);

        if ($tenant?->user) {
            // VERIF-602 M2 — un compte n'a pas besoin du lien porteur : sa cloche mène à son bail.
            $notifications->send($tenant->user, $code, $params, $target, agencyId: $agencyId);
            // TCK-1493 (P107.01) — sans téléphone vérifié, le canal mobile part au numéro de la
            // fiche, avec les paramètres du compte : pas de lien porteur.
            $relais = ContactSansCompte::relaisMobileDuCompte($tenant->user, ContactSansCompte::fromCustomer($tenant));
            if ($relais !== null) {
                $notifications->send($relais, $code, $params, $target, agencyId: $agencyId);
            }

            return;
        }

        $contact = $tenant ? ContactSansCompte::fromCustomer($tenant) : null;
        if ($contact?->hasPhone()) {
            // TCK-602 (ADR-0051 §1) — 588 a prévu la place du lien, 602 le génère : le MÊME lien à
            // chaque relance, seulement si l'échéance se paie en ligne (un fournisseur au moins).
            // TCK-2706 — sans détail (`charges`), le seul lien de la tête du groupe, comme avant.
            $payables = $code->variant($params) !== null ? $dues : [$payment];
            $gateway = app(PaymentGatewayService::class);
            $guard = null;
            $enLigne = array_filter($payables, fn (LeasePayment $due): bool => $gateway->isPayable($due) && $gateway->availableProviders($due) !== []);
            if (count($enLigne) === count($payables)) {
                $links = app(LeasePaymentLinkService::class);
                $urls = array_map(fn (LeasePayment $due): string => $links->urlFor($due, locale: $contact->locale), $payables);
                $params['payment_url'] = $urls[0];
                if (isset($urls[1])) {
                    $params['charges_url'] = $urls[1];
                }
                // TCK-1346 (P132.04) — reporté à la nuit, le SMS relit son lien avant de partir ;
                // TCK-2706 — tous ses liens.
                $guard = count($urls) === 1 ? DeferredSmsGuard::forPayLink($urls[0]) : DeferredSmsGuard::forPayLinks(...$urls);
            }
            // P207.01 (TCK-2157) — au plus une fois (TCK-740) : un SMS que tous les fournisseurs
            // refusent n'est pas renvoyé, et laisse une activité d'exploitation sur l'échéance.
            $notifications->send($contact, $code, $params, $target, deferredSmsGuard: $guard, smsRefusalSubject: $payment, agencyId: $agencyId);

            return;
        }

        Log::info('[lease-reminders] locataire injoignable — ni compte ni téléphone valide', [
            'lease_payment_id' => $payment->id,
            'code' => $code->value,
        ]);
    }

    private static function agenceDuBail(?Lease $lease): ?int
    {
        return $lease?->agency_id !== null ? (int) $lease->agency_id : null;
    }
}
