@extends('pdf.layouts.base')

@php
    // Expected variables:
    //   $invoice, $customer, $agency, $lines (array of {label, qty, unit_price, total})
    // TCK-084 — `@currency` resolves agency-level formatting. The invoice is
    // the source of truth for which currency we settled on at issuance time;
    // we fall back to the agency's current currency, then XOF for safety.
    $currency = $invoice->currency ?? $agency?->currency ?? 'XOF';
    // P140.03 (TCK-1790) — une facture émise imprime les mentions, le destinataire et la
    // désignation figés à son émission (`InvoiceNumberAllocator`) ; un brouillon, ou une facture
    // émise avant ce gel, les valeurs courantes.
    $issued = is_array($invoice->metadata['issued'] ?? null) ? $invoice->metadata['issued'] : null;
    // TCK-835 (P26.05) — sans lignes, la désignation de l'objet facturé, et « Prestation » en dernier.
    $lines = $lines ?? [[
        'label' => ($issued !== null ? ($issued['designation'] ?? null) : $invoice->designation()) ?? 'Prestation',
        'qty' => 1,
        'unit_price' => $invoice->subtotal,
        'total' => $invoice->subtotal,
    ]];
@endphp

@php
    // TCK-594 (ADR-0039 §7) — un avoir se dit tel, avec la facture qu'il annule ; les mentions
    // légales de l'agence s'impriment quand elles existent, jamais un libellé vide.
    $isCreditNote = ($invoice->kind?->value ?? $invoice->kind) === 'credit_note';
    $credited = $isCreditNote ? $invoice->creditedInvoice : null;
    $legalSource = $issued !== null ? (array) ($issued['agency'] ?? []) : [
        'legal_name' => $agency?->legal_name,
        'ninea' => $agency?->ninea,
        'rccm' => $agency?->rccm,
        'legal_address' => $agency?->legal_address,
    ];
    $legal = array_filter([
        'Raison sociale' => $legalSource['legal_name'] ?? null,
        'NINEA' => $legalSource['ninea'] ?? null,
        'RCCM' => $legalSource['rccm'] ?? null,
        'Adresse' => $legalSource['legal_address'] ?? null,
    ], static fn ($value): bool => is_string($value) && trim($value) !== '');
    $recipient = $issued !== null ? (array) ($issued['customer'] ?? []) : [
        'name' => $customer?->invoiceRecipientName(),
        'email' => $customer->email ?? null,
        'phone' => $customer->phone ?? null,
    ];
@endphp

@section('content')
    <h1>{{ $isCreditNote ? 'Avoir' : 'Facture' }}</h1>
    <p class="muted">N° {{ $invoice->reference_number ?? 'INV-'.$invoice->id }}</p>
    @if ($credited)
        <p class="muted">Annule la facture n° {{ $credited->reference_number }}</p>
    @endif

    <table class="kv">
        <tr>
            <th>Émise le</th>
            <td>
                @if ($invoice->issue_date)
                    {{ $invoice->issue_date->translatedFormat('d/m/Y') }}
                @else
                    —
                @endif
            </td>
        </tr>
        <tr>
            <th>Échéance</th>
            <td>
                @if ($invoice->due_date)
                    {{ $invoice->due_date->translatedFormat('d/m/Y') }}
                @else
                    —
                @endif
            </td>
        </tr>
        <tr>
            <th>Statut</th>
            <td><span class="pill">{{ $invoice->status?->value ?? $invoice->status ?? 'draft' }}</span></td>
        </tr>
    </table>

    <h2>Destinataire</h2>
    <table class="kv">
        <tr>
            <th>Client</th>
            <td>{{ ($recipient['name'] ?? null) ?: '—' }}</td>
        </tr>
        @if ($recipient['email'] ?? false)
        <tr>
            <th>Email</th>
            <td>{{ $recipient['email'] }}</td>
        </tr>
        @endif
        @if ($recipient['phone'] ?? false)
        <tr>
            <th>Téléphone</th>
            <td>{{ $recipient['phone'] }}</td>
        </tr>
        @endif
    </table>

    <h2>Détail</h2>
    <table class="data">
        <thead>
            <tr>
                <th>Désignation</th>
                <th class="right">Qté</th>
                <th class="right">Prix unitaire</th>
                <th class="right">Total</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($lines as $line)
                <tr>
                    <td>{{ $line['label'] ?? '—' }}</td>
                    <td class="right">{{ $line['qty'] ?? 1 }}</td>
                    <td class="right amount">@currency($line['unit_price'] ?? 0, $currency)</td>
                    <td class="right amount">@currency($line['total'] ?? 0, $currency)</td>
                </tr>
            @endforeach
        </tbody>
        <tfoot>
            {{-- TCK-836 (P26.06) — le taux au format français : « 18,5 », jamais « 18.5 ». --}}
            <tr>
                <td colspan="3" class="right">Sous-total</td>
                <td class="right amount">@currency($invoice->subtotal, $currency)</td>
            </tr>
            @if ((float) ($invoice->tax_amount ?? 0) > 0)
            <tr>
                <td colspan="3" class="right">TVA ({{ rtrim(rtrim(number_format((float) $invoice->tax_rate, 2, ',', ' '), '0'), ',') }}%)</td>
                <td class="right amount">@currency($invoice->tax_amount, $currency)</td>
            </tr>
            @endif
            <tr>
                <td colspan="3" class="right">Total TTC</td>
                <td class="right amount"><strong>@currency($invoice->total_amount, $currency)</strong></td>
            </tr>
        </tfoot>
    </table>

    @if ($invoice->notes)
        <h2>Notes</h2>
        <p>{{ $invoice->notes }}</p>
    @endif

    @if ($legal !== [])
        <p class="muted legal-mentions">
            @foreach ($legal as $label => $value)
                {{ $label }} : {{ $value }}@if (! $loop->last) — @endif
            @endforeach
        </p>
    @endif
@endsection
