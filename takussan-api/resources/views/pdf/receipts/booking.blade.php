@extends('pdf.layouts.base')

@php
    /**
     * Quittance de paiement de réservation (TCK-172, convergée par TCK-354).
     *
     * Variables attendues, fournies par App\Services\Payments\PaymentReceiptPdf :
     *   $reference, $amount, $currency, $paid_at, $method, $type,
     *   $property, $customer, $agency, $context_label
     *
     * Ce gabarit remplace `payments/receipt.blade.php`, qui portait sa propre page HTML
     * complète — en-tête, pied de page et feuille de style compris — hors du système de
     * `pdf.layouts.base`. Il en héritait deux écarts, tous deux invisibles à la lecture du
     * fichier seul :
     *
     *   · le logo de l'agence, la pagination et la mention « Document généré le … » du pied
     *     partagé n'y apparaissaient pas ;
     *   · le montant était formaté à la main — `number_format($amount, 0, ',', ' ')` suivi du
     *     CODE de devise — au lieu de `@currency`, si bien qu'une agence en EUR lisait
     *     « 250 000 EUR » là où TCK-084 impose « 250 000,00 € ».
     *
     * *Un gabarit qui se suffit à lui-même ne diverge pas d'un coup : il diverge d'une
     * décision à la fois, et chacune paraît locale.*
     */
    $currencyCode = $currency ?? $agency?->currency ?? 'XOF';
    $customerName = $customer
        ? (trim(($customer->first_name ?? '').' '.($customer->last_name ?? '')) ?: ($customer->email ?? null))
        : null;
@endphp

@section('content')
    <h1>Quittance de paiement</h1>
    <p class="muted">Référence : {{ $reference ?? '—' }}</p>
    <p><span class="pill">Acquittée</span></p>

    <h2>Paiement</h2>
    <table class="kv">
        <tr>
            <th>Montant</th>
            <td class="amount"><strong>@currency($amount, $currencyCode)</strong></td>
        </tr>
        <tr>
            <th>Contexte</th>
            <td>{{ $context_label }}</td>
        </tr>
        <tr>
            <th>Type</th>
            <td>{{ $type ?? '—' }}</td>
        </tr>
        <tr>
            <th>Méthode</th>
            <td>{{ $method ?? '—' }}</td>
        </tr>
        <tr>
            <th>Date du paiement</th>
            <td>{{ $paid_at ? $paid_at->translatedFormat('d/m/Y H:i') : '—' }}</td>
        </tr>
    </table>

    @if ($agency || $customerName || $property)
        <h2>Parties</h2>
        <table class="kv">
            @if ($agency)
                <tr>
                    <th>Émise par</th>
                    <td>{{ $agency->name ?? 'Agence' }}</td>
                </tr>
            @endif
            @if ($customerName)
                <tr>
                    <th>Bénéficiaire</th>
                    <td>{{ $customerName }}</td>
                </tr>
            @endif
            @if ($property)
                <tr>
                    <th>Bien</th>
                    <td>{{ $property->title ?? '—' }}</td>
                </tr>
            @endif
        </table>
    @endif

    <p class="muted">
        Cette quittance atteste du règlement indiqué ci-dessus. En cas de question, contactez
        votre agence en citant la référence portée en tête de document.
    </p>
@endsection
