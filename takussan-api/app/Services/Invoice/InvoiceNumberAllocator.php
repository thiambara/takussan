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
            $fresh = Invoice::query()->whereKey($invoice->id)->first(['id', 'sequence_number', 'metadata']);
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
                'metadata' => json_encode(
                    array_merge(is_array($fresh?->metadata) ? $fresh->metadata : [], ['issued' => $this->issuedMentions($invoice)]),
                    JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE,
                ),
            ]);
        });

        return $invoice->refresh();
    }

    /**
     * P140.03 (TCK-1790) — ce que le PDF d'une facture émise imprime et qui ne vit pas sur elle :
     * les mentions légales de l'agence, l'identité du destinataire et la désignation, figées à
     * l'émission dans `metadata.issued`. Une facture remise au client se reproduit ainsi à
     * l'identique, quoi que deviennent ensuite l'agence, le client ou le bien. Les clés suivent
     * celles que lit `pdf.invoices.default`.
     *
     * @return array{agency: array<string, ?string>, customer: array<string, ?string>, designation: ?string}
     */
    private function issuedMentions(Invoice $invoice): array
    {
        $agency = Agency::query()->find($invoice->agency_id);
        $customer = $invoice->customer()->withTrashed()->first();
        $name = $customer !== null
            ? (trim(($customer->first_name ?? '').' '.($customer->last_name ?? '')) ?: ($customer->name ?? null))
            : null;

        return [
            'agency' => [
                'legal_name' => $agency?->legal_name,
                'ninea' => $agency?->ninea,
                'rccm' => $agency?->rccm,
                'legal_address' => $agency?->legal_address,
            ],
            'customer' => [
                'name' => $name,
                'email' => $customer?->email,
                'phone' => $customer?->phone,
            ],
            'designation' => $invoice->designation(),
        ];
    }
}
