<?php

namespace App\Services\Invoice;

use App\Models\Agency;
use App\Models\Enums\InvoiceKind;
use App\Models\Invoice;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §7) — le SEUL point qui donne son numéro à une facture.
 *
 * Le numéro est continu par `(agency_id, kind, année)` — `FA-2026-00001`, `AV-2026-00001` — et
 * attribué à l'émission, jamais au brouillon : un brouillon annulé n'a rien consommé. Le compteur se
 * lit sous le verrou de la LIGNE AGENCE, puis par un `MAX` hors verrou d'agrégat (piège PostgreSQL
 * n° 2 : `lockForUpdate()->max()` est refusé, et verrouiller les factures existantes ne fermerait
 * aucune course d'INSERT). Deux émissions concurrentes de la même agence se sérialisent sur cette
 * ligne ; l'index `invoices_agency_kind_seq_unique` reste la garde de dernier recours.
 *
 * Idempotent : une facture déjà numérotée garde son numéro, et une facture sans agence garde sa
 * référence `INV-…` (aucune séquence n'a de sens hors d'une agence). On ne renumérote jamais.
 *
 * Sites d'appel : `InvoiceService::send`, `InvoiceService::markPaid` (brouillon), `InvoiceService::cancel`
 * (l'avoir), `EarlyTerminationService` (pénalité émise directement), `PaymentGatewayService` (un
 * brouillon soldé par la passerelle). `DepositRefundService` crée un BROUILLON : il n'est numéroté
 * qu'à son émission.
 */
final class InvoiceNumberAllocator
{
    public function allocate(Invoice $invoice): Invoice
    {
        if ($invoice->sequence_number !== null || $invoice->agency_id === null) {
            return $invoice;
        }

        DB::transaction(function () use ($invoice): void {
            Agency::query()->whereKey($invoice->agency_id)->lockForUpdate()->firstOrFail();

            // Relue sous le verrou : une émission concurrente de la MÊME facture l'a peut-être déjà
            // numérotée.
            $fresh = Invoice::query()->whereKey($invoice->id)->first(['id', 'sequence_number']);
            if ($fresh?->sequence_number !== null) {
                return;
            }

            $kind = $invoice->kind ?? InvoiceKind::Invoice;
            $year = (int) now()->format('Y');
            $next = 1 + (int) Invoice::withTrashed()
                ->where('agency_id', $invoice->agency_id)
                ->where('kind', $kind->value)
                ->where('sequence_year', $year)
                ->max('sequence_number');

            Invoice::withTrashed()->whereKey($invoice->id)->update([
                'sequence_year' => $year,
                'sequence_number' => $next,
                'reference_number' => sprintf('%s-%d-%05d', $kind->prefix(), $year, $next),
            ]);
        });

        return $invoice->refresh();
    }
}
