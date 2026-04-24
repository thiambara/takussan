@extends('pdf.layouts.base')

@php
    // Expected variables:
    //   $invoice, $customer, $agency, $lines (array of {label, qty, unit_price, total})
    $currency = $invoice->currency?->value ?? $invoice->currency ?? 'XOF';
    $fmt = fn ($n) => number_format((float) $n, 0, ',', ' ').' '.$currency;
    $lines = $lines ?? [[
        'label' => 'Prestation',
        'qty' => 1,
        'unit_price' => $invoice->subtotal,
        'total' => $invoice->subtotal,
    ]];
@endphp

@section('content')
    <h1>Facture</h1>
    <p class="muted">N° {{ $invoice->reference_number ?? 'INV-'.$invoice->id }}</p>

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
            <td>{{ trim(($customer->first_name ?? '').' '.($customer->last_name ?? '')) ?: ($customer->name ?? '—') }}</td>
        </tr>
        @if ($customer->email ?? false)
        <tr>
            <th>Email</th>
            <td>{{ $customer->email }}</td>
        </tr>
        @endif
        @if ($customer->phone ?? false)
        <tr>
            <th>Téléphone</th>
            <td>{{ $customer->phone }}</td>
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
                    <td class="right amount">{{ $fmt($line['unit_price'] ?? 0) }}</td>
                    <td class="right amount">{{ $fmt($line['total'] ?? 0) }}</td>
                </tr>
            @endforeach
        </tbody>
        <tfoot>
            <tr>
                <td colspan="3" class="right">Sous-total</td>
                <td class="right amount">{{ $fmt($invoice->subtotal) }}</td>
            </tr>
            @if ((float) ($invoice->tax_amount ?? 0) > 0)
            <tr>
                <td colspan="3" class="right">TVA ({{ rtrim(rtrim(number_format((float) $invoice->tax_rate, 2), '0'), '.') }}%)</td>
                <td class="right amount">{{ $fmt($invoice->tax_amount) }}</td>
            </tr>
            @endif
            <tr>
                <td colspan="3" class="right">Total TTC</td>
                <td class="right amount"><strong>{{ $fmt($invoice->total_amount) }}</strong></td>
            </tr>
        </tfoot>
    </table>

    @if ($invoice->notes)
        <h2>Notes</h2>
        <p>{{ $invoice->notes }}</p>
    @endif
@endsection
