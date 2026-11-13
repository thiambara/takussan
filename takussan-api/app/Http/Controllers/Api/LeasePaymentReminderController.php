<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Payments\StoreLeasePaymentReminderRequest;
use App\Models\Enums\PaymentLinkSubject;
use App\Models\LeasePayment;
use App\Models\LeasePaymentReminder;
use App\Services\Payments\LeasePaymentReminderReader;
use App\Services\Reporting\OverdueInstalment;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2658 (ADR-0105) — la relance d'un impayé, NOTÉE : l'agence a relancé depuis son téléphone
 * (WhatsApp ou appel), l'API garde le fait. La route n'envoie rien — ni SMS, ni WhatsApp, ni
 * e-mail, ni notification.
 *
 * Seulement sur une échéance de bail en retard (`OverdueInstalment` : due, non soldée, échue avant
 * aujourd'hui, hors restitution de caution) — ou, depuis TCK-2778, sur une échéance payée dont la
 * pénalité de retard reste due (`LeasePayment::lateFeeAloneOutstanding()`, `subject: late_fee`) —
 * sinon 409 `lease_payment.not_overdue`. Autorisation :
 * `LeasePaymentPolicy::remind`, le personnel de l'agence du bail.
 */
class LeasePaymentReminderController extends Controller
{
    public function __construct(private readonly LeasePaymentReminderReader $reader) {}

    public function index(LeasePayment $payment): JsonResponse
    {
        $this->authorize('remind', $payment);

        return $this->json(['data' => $this->reader->forPayment($payment)]);
    }

    public function store(StoreLeasePaymentReminderRequest $request, LeasePayment $payment): JsonResponse
    {
        // TCK-2778 — ce que la relance relance se DÉDUIT de l'échéance, jamais du corps : le loyer en
        // retard (`rent`, pénalité comprise), ou la pénalité restée due sur un loyer soldé (`late_fee`).
        // Rien de dû : 409 inchangé.
        $subject = match (true) {
            OverdueInstalment::daysLate($payment) !== null => PaymentLinkSubject::Rent,
            $payment->lateFeeAloneOutstanding() => PaymentLinkSubject::LateFee,
            default => null,
        };
        abort_code_unless($subject !== null, 409, 'lease_payment.not_overdue');

        $reminder = LeasePaymentReminder::query()->create([
            'agency_id' => $payment->lease->agency_id,
            'lease_payment_id' => $payment->id,
            'channel' => $request->validated('channel'),
            'subject' => $subject,
            'created_by_id' => $request->user()->id,
            'note' => $request->validated('note'),
        ]);
        $reminder->setRelation('createdBy', $request->user());

        return $this->json(['data' => [
            'id' => $reminder->id,
            'at' => $this->instant($reminder->created_at),
            'source' => 'manual',
            'channel' => $reminder->channel->value,
            'subject' => $reminder->subject->value,
            'by' => ['id' => $request->user()->id, 'name' => $request->user()->full_name],
            'note' => $reminder->note,
            'milestone' => null,
        ]], 201);
    }
}
