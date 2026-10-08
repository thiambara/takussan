<?php

namespace App\Jobs;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Property\PrimaryPropertyContact;
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
 *     J-3 sur `due_date = today + 3` ; retard sur `due_date ∈ {today - 1, today - 7}`.
 *   · **Montant.** Le solde (`remaining_amount`), pas `amount` — une échéance partiellement
 *     payée annonçait la somme entière.
 *   · **Jours.** `(int) due_date->diffInDays(now(), true)`. Carbon 3 rend `diffInDays` SIGNÉ et
 *     FLOTTANT : la forme d'avant annonçait « en retard de -7.33 jour(s) ».
 *   · **Destinataires.** Le locataire, avec ou sans compte ({@see ContactSansCompte}) ; le
 *     bailleur (`overdue_landlord`) ; l'agent, UN récapitulatif par jour (`overdue_digest`).
 *   · **Pas de doublon.** Un marqueur par jalon dans `metadata`, posé sous verrou de ligne
 *     comme `SendPropertyVisitReminders` : un second passage le même jour n'envoie rien.
 */
class SendLeasePaymentReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** @var list<PaymentStatus> */
    public const OPEN_STATUSES = [PaymentStatus::Pending, PaymentStatus::PartiallyPaid, PaymentStatus::Late];

    public const DUE_SOON_DAYS = 3;

    /** @var list<int> */
    public const OVERDUE_DAYS = [1, 7];

    public function handle(NotificationService $notifications): void
    {
        foreach ($this->claim(now()->addDays(self::DUE_SOON_DAYS)->toDateString(), 'due_soon') as $payment) {
            $this->notifyTenant($notifications, $payment, NotificationCode::LeasePaymentDueSoon, [
                'amount' => $this->remaining($payment),
                'due_date' => $payment->due_date?->toDateString(),
                'property' => $payment->lease?->property?->title,
            ]);
        }

        /** @var array<int, array{agent: User, count: int, total: float, currency: ?Currency}> $digests */
        $digests = [];
        foreach (self::OVERDUE_DAYS as $offset) {
            foreach ($this->claim(now()->subDays($offset)->toDateString(), "overdue_{$offset}") as $payment) {
                $days = (int) $payment->due_date->diffInDays(now(), true);
                $lease = $payment->lease;
                $amount = $this->remaining($payment);

                $this->notifyTenant($notifications, $payment, NotificationCode::LeasePaymentOverdue, [
                    'amount' => $amount,
                    'days' => $days,
                    'due_date' => $payment->due_date->toDateString(),
                    'property' => $lease?->property?->title,
                ]);

                $landlord = $lease?->landlord;
                if ($landlord) {
                    $notifications->send($landlord, NotificationCode::LeasePaymentOverdueLandlord, [
                        'amount' => $amount,
                        'days' => $days,
                        'property' => $lease->property?->title,
                        'tenant' => trim(($lease->tenant?->first_name ?? '').' '.($lease->tenant?->last_name ?? '')),
                    ], NotificationTarget::of('lease', $lease->id));
                }

                // L'agent : le contact principal du bien, quand ce n'est pas le bailleur lui-même.
                $agent = $lease?->property ? PrimaryPropertyContact::for($lease->property) : null;
                if ($agent && $agent->id !== $landlord?->id) {
                    $digests[$agent->id] ??= ['agent' => $agent, 'count' => 0, 'total' => 0.0, 'currency' => $payment->currency];
                    $digests[$agent->id]['count']++;
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
     * Les échéances ouvertes dues ce jour-là et pas encore relancées pour ce jalon. Chaque
     * marqueur est posé sous verrou de ligne : deux passages concurrents ne relancent pas deux
     * fois la même échéance.
     *
     * @return list<LeasePayment>
     */
    private function claim(string $dueDate, string $milestone): array
    {
        $key = "reminder_{$milestone}_sent_at";
        // TCK-594 (VERIF-594 passe 4, P4-7) — une caution rendue est due AU locataire : il n'en est
        // pas relancé.
        $ids = LeasePayment::query()
            ->exceptDepositRefunds()
            ->whereIn('status', self::OPEN_STATUSES)
            ->whereDate('due_date', $dueDate)
            ->pluck('id');

        $claimed = [];
        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $key, &$claimed): void {
                $payment = LeasePayment::query()->whereKey($id)->lockForUpdate()->first();
                if (! $payment || ! empty(($payment->metadata ?? [])[$key])) {
                    return;
                }
                $payment->forceFill(['metadata' => [...($payment->metadata ?? []), $key => now()->toIso8601String()]])->saveQuietly();
                $claimed[] = $payment->id;
            });
        }

        return LeasePayment::query()
            ->whereKey($claimed)
            ->with([
                'lease.tenant.user',
                'lease.landlord',
                ...array_map(fn (string $relation) => "lease.property.{$relation}", PrimaryPropertyContact::eagerLoads()),
            ])
            ->get()
            ->all();
    }

    /** @return array{amount: string, currency: string} */
    private function remaining(LeasePayment $payment): array
    {
        return NotificationRenderer::money($payment->remaining_amount, $payment->currency);
    }

    /**
     * Le locataire : son compte, sinon son téléphone (contact sans compte), sinon personne —
     * journalisé, sans exception.
     *
     * @param  array<string, mixed>  $params
     */
    private function notifyTenant(NotificationService $notifications, LeasePayment $payment, NotificationCode $code, array $params): void
    {
        $lease = $payment->lease;
        $tenant = $lease?->tenant;
        $target = $lease ? NotificationTarget::of('lease', $lease->id) : null;

        // TCK-602 (ADR-0051 §1) — 588 a prévu la place du lien, 602 le génère : le MÊME lien à
        // chaque relance, seulement si l'échéance se paie en ligne (un fournisseur au moins).
        $gateway = app(PaymentGatewayService::class);
        if ($gateway->isPayable($payment) && $gateway->availableProviders($payment) !== []) {
            $params['payment_url'] = app(LeasePaymentLinkService::class)->urlFor($payment);
        }

        if ($tenant?->user) {
            $notifications->send($tenant->user, $code, $params, $target);

            return;
        }

        $contact = $tenant ? ContactSansCompte::fromCustomer($tenant) : null;
        if ($contact?->hasPhone()) {
            $notifications->send($contact, $code, $params, $target);

            return;
        }

        Log::info('[lease-reminders] locataire injoignable — ni compte ni téléphone valide', [
            'lease_payment_id' => $payment->id,
            'code' => $code->value,
        ]);
    }
}
