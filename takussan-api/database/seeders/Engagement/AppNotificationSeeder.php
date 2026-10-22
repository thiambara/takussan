<?php

namespace Database\Seeders\Engagement;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use Carbon\CarbonInterface;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Seeder;

/**
 * TCK-1324 (P128.04) — chaque notification s'écrit par CODE et paramètres BRUTS, comme
 * `NotificationService::send` : le titre et le corps rangés sont rendus dans la langue du
 * destinataire, et la cloche les rend dans la langue de l'écran. Les lignes écrites jusque-là en
 * phrases françaises figées, sans code, laissaient la cloche en français dans une interface `en` et
 * n'exerçaient jamais le rendu par code en développement.
 *
 * Chaque famille prend le code que l'application émet pour le même événement et le même
 * destinataire, avec les paramètres de son émetteur réel :
 *   · visite → son agent : `visit.requested` (`VisitNotifier::requested`) ;
 *   · paiement de loyer reçu → le bailleur : `lease_payment.received_landlord`
 *     (`LeasePaymentService`) ;
 *   · intervention attribuée → l'attributaire : `maintenance.assigned`
 *     (`NotifyMaintenanceParticipants`).
 *
 * Retirées faute de code apparié (décision du porteur, 2026-10-22) : le rappel d'échéance au
 * BAILLEUR (l'application ne le rappelle qu'au locataire), la réservation à son AUTEUR
 * (`NotifyOnBookingRequested` l'exclut), l'intervention sans attributaire à son demandeur, et
 * « Nouveau bail » (aucun code au catalogue).
 */
class AppNotificationSeeder extends Seeder
{
    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly NotificationRenderer $renderer,
    ) {}

    public function run(): void
    {
        $this->fromLeasePayments();
        $this->fromMaintenance();
        $this->fromVisits();
    }

    private function fromVisits(): void
    {
        PropertyVisit::query()
            ->whereNotNull('agent_id')
            ->with(['agent', 'property:id,title'])
            ->chunkById(200, function ($visits) {
                foreach ($visits as $visit) {
                    if (! $visit->agent) {
                        continue;
                    }
                    $isRead = $this->ctx->faker()->boolean(50);
                    $this->write($visit->agent, NotificationCode::VisitRequested, [
                        'property' => $visit->property?->title ?? '#'.$visit->id,
                        'scheduled_at' => $visit->scheduled_at?->toIso8601String(),
                        'timezone' => $visit->agent->timezone ?: NotificationRenderer::DEFAULT_TIMEZONE,
                        'contact' => implode(' · ', array_filter([$visit->visitor_phone, $visit->visitor_email])) ?: null,
                    ], NotificationTarget::of('visit', $visit->id), $visit->created_at, $isRead ? $visit->created_at : null);
                }
            });
    }

    private function fromLeasePayments(): void
    {
        LeasePayment::query()
            ->whereNotNull('paid_at')
            ->with(['lease:id,landlord_id,property_id,tenant_id', 'lease.landlord', 'lease.property:id,title', 'lease.tenant:id,first_name,last_name'])
            ->chunkById(200, function ($payments) {
                foreach ($payments as $payment) {
                    $lease = $payment->lease;
                    if (! $lease?->landlord) {
                        continue;
                    }
                    $isRead = $this->ctx->faker()->boolean(60);
                    $this->write($lease->landlord, NotificationCode::LeasePaymentReceivedLandlord, [
                        'amount' => NotificationRenderer::money($payment->amount, $payment->currency),
                        'property' => $lease->property?->title,
                        'tenant' => trim(($lease->tenant?->first_name ?? '').' '.($lease->tenant?->last_name ?? '')),
                    ], NotificationTarget::of('lease', $lease->id), $payment->paid_at, $isRead ? $payment->paid_at : null);
                }
            });
    }

    private function fromMaintenance(): void
    {
        MaintenanceRequest::query()
            ->whereNotNull('assigned_to')
            ->with(['assignee', 'property:id,title'])
            ->chunkById(100, function ($requests) {
                foreach ($requests as $request) {
                    if (! $request->assignee) {
                        continue;
                    }
                    $isRead = $this->ctx->faker()->boolean(40);
                    $this->write($request->assignee, NotificationCode::MaintenanceAssigned, [
                        'request' => (string) $request->title,
                        'property' => (string) $request->property?->title,
                    ], NotificationTarget::of('maintenance', $request->id), $request->created_at, $isRead ? $request->created_at : null);
                }
            });
    }

    /**
     * La ligne que `NotificationService::send` écrirait, datée du moment de l'événement.
     *
     * @param  array<string, mixed>  $params
     */
    private function write(User $to, NotificationCode $code, array $params, NotificationTarget $target, ?CarbonInterface $at, ?CarbonInterface $readAt): void
    {
        $locale = $to->preferredLocale() ?? (string) config('app.locale');
        $timezone = $to->timezone ?: NotificationRenderer::DEFAULT_TIMEZONE;
        $at ??= now();

        AppNotification::create([
            'user_id' => $to->id,
            'type' => $code->type(),
            'code' => $code->value,
            'params' => $params,
            'target' => $target->toArray(),
            'delivery_channel' => NotificationChannel::App,
            'title' => $this->renderer->render($code, $params, $locale, $timezone, 'title', $to->first_name),
            'body' => $this->renderer->render($code, $params, $locale, $timezone, 'body', $to->first_name),
            'is_read' => $readAt !== null,
            'read_at' => $readAt,
            'sent_at' => $at,
            'created_at' => $at,
            'updated_at' => $at,
        ]);
    }
}
