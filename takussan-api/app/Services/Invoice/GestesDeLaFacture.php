<?php

namespace App\Services\Invoice;

use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\User;
use App\Services\Model\InvoiceService;
use App\Services\Payments\PaymentGatewayService;

/**
 * TCK-3011 (ADR-0139) — les gestes d'une facture : pour chacun, « possible MAINTENANT pour ce lecteur »,
 * policy ET état compris. `InvoiceResource::forViewer` en tire `abilities` ; la fiche
 * (`InvoiceDetailDialog`) n'en recalcule aucun. Elle jugeait le seul statut, sans capacité : le client
 * voyait « Envoyer », « Marquer payée », « Annuler » (403), et « Payer en ligne » s'offrait sur un
 * brouillon, que la passerelle refuse (409 `payment.not_payable`).
 *
 * Les prédicats d'état sont relus par `InvoiceService` sur la ligne VERROUILLÉE ({@see self::envoyable()},
 * {@see self::encaissable()}, {@see self::annulable()}) : une règle d'état, une définition. Le paiement en
 * ligne lit celui de la passerelle, qui le rejuge sous son propre verrou
 * ({@see PaymentGatewayService::isPayable()}).
 *
 * Le « qui » reste celui d'`InvoicePolicy` (`send`, `markPaid`, `cancel`) et, pour payer en ligne, de
 * `PaymentGatewayController::initiate` (`update`) ; ce module les compose avec l'état.
 */
final class GestesDeLaFacture
{
    /** Les clés d'`abilities`, dans leur ordre de service. */
    public const GESTES = ['send', 'mark_paid', 'cancel', 'pay'];

    /** @return array<string, bool> une clé par {@see self::GESTES} */
    public function pour(User $lecteur, Invoice $facture): array
    {
        return [
            'send' => self::envoyable($facture) && $lecteur->can('send', $facture),
            'mark_paid' => self::encaissable($facture) && $lecteur->can('markPaid', $facture),
            'cancel' => self::annulable($facture) && $lecteur->can('cancel', $facture),
            'pay' => app(PaymentGatewayService::class)->isPayable($facture) && $lecteur->can('update', $facture),
        ];
    }

    /** Envoyer : un brouillon (`invoice.not_draft_send`) ; l'émission lui attribue son numéro. */
    public static function envoyable(Invoice $facture): bool
    {
        return $facture->status === InvoiceStatus::Draft;
    }

    /** Marquer payée : émise, échue, ou un brouillon, que le règlement émet (`invoice.cannot_mark_paid`). */
    public static function encaissable(Invoice $facture): bool
    {
        return in_array($facture->status, [InvoiceStatus::Draft, InvoiceStatus::Sent, InvoiceStatus::Overdue], true);
    }

    /**
     * Annuler : tout sauf une facture payée, annulée ou nulle (`invoice.cannot_cancel`) ; une facture émise
     * s'annule par un avoir ({@see InvoiceService::cancel()}).
     */
    public static function annulable(Invoice $facture): bool
    {
        return ! in_array($facture->status, [InvoiceStatus::Paid, InvoiceStatus::Cancelled, InvoiceStatus::Void], true);
    }
}
