@extends('pdf.layouts.base')

@php
    // Expected variables:
    //   $lease, $payment, $tenant, $property, $agency
    //   $generated_at
    $currency = $payment->currency?->value ?? $payment->currency ?? 'XOF';
    $amount = number_format((float) $payment->amount, 0, ',', ' ');
    $periodLabel = null;
    if ($payment->period_start) {
        $periodLabel = $payment->period_start->translatedFormat('F Y');
    }
    $paymentDate = $payment->paid_at ?? $payment->due_date;
@endphp

@section('content')
    <h1>Quittance de loyer</h1>
    <p class="muted">Référence : {{ $payment->reference_number ?? 'N/A' }}</p>

    <h2>Bien concerné</h2>
    <table class="kv">
        <tr>
            <th>Adresse</th>
            <td>{{ $property->address?->full_address ?? $property->title ?? 'Bien n°'.$property->id }}</td>
        </tr>
        <tr>
            <th>Référence bail</th>
            <td>{{ $lease->reference_number ?? 'LS-'.$lease->id }}</td>
        </tr>
    </table>

    <h2>Locataire</h2>
    <table class="kv">
        <tr>
            <th>Nom</th>
            <td>{{ trim(($tenant->first_name ?? '').' '.($tenant->last_name ?? '')) }}</td>
        </tr>
        @if ($tenant->email ?? false)
        <tr>
            <th>Email</th>
            <td>{{ $tenant->email }}</td>
        </tr>
        @endif
    </table>

    <h2>Paiement</h2>
    <table class="kv">
        @if ($periodLabel)
        <tr>
            <th>Période</th>
            <td>{{ ucfirst($periodLabel) }}</td>
        </tr>
        @endif
        <tr>
            <th>Montant</th>
            <td class="amount"><strong>{{ $amount }} {{ $currency }}</strong></td>
        </tr>
        <tr>
            <th>Méthode</th>
            <td>{{ $payment->payment_method?->value ?? $payment->payment_method ?? 'n/a' }}</td>
        </tr>
        <tr>
            <th>Date</th>
            <td>
                @if ($paymentDate)
                    {{ $paymentDate->translatedFormat('d/m/Y') }}
                @else
                    —
                @endif
            </td>
        </tr>
        <tr>
            <th>Statut</th>
            <td><span class="pill">{{ $payment->status?->value ?? $payment->status ?? '—' }}</span></td>
        </tr>
    </table>

    <p class="muted">
        Cette quittance atteste du règlement du loyer pour la période indiquée.
        Elle ne vaut pas lettre de décharge pour les autres sommes dues au titre du bail.
    </p>
@endsection
