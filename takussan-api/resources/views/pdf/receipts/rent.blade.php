@extends('pdf.layouts.base')

@php
    // Expected variables:
    //   $lease, $payment, $tenant, $property, $agency
    //   $wording (TCK-725) : title, amount_line, attestation — selon le type d'échéance
    //   $generated_at
    // TCK-084 — `@currency` handles locale + symbol; the payment row carries
    // the locked currency, with agency-fallback for legacy data.
    $currency = $payment->currency ?? $agency?->currency ?? 'XOF';
    $periodLabel = null;
    if ($payment->period_start) {
        $periodLabel = $payment->period_start->translatedFormat('F Y');
        // TCK-834 (P26.03) — une échéance trimestrielle ou annuelle couvre plusieurs mois (TCK-667) :
        // son mois de départ ne dit pas ce qu'elle acquitte.
        $oneMonthEnd = $payment->period_start->copy()->addMonthNoOverflow()->subDay();
        if ($payment->period_end && $payment->period_end->gt($oneMonthEnd)) {
            $periodLabel = 'du '.$payment->period_start->translatedFormat('j F Y')
                .' au '.$payment->period_end->translatedFormat('j F Y');
        }
    }
    // TCK-593 — une quittance n'est délivrée que pour un loyer acquitté (`DocumentPdfController`
    // rend 422 sinon) : elle est datée du RÈGLEMENT, jamais de l'échéance.
    $paymentDate = $payment->paid_at;
    $lateFee = (float) ($payment->late_fee_amount ?? 0);
    $lateFeePaid = $lateFee > 0 && $payment->late_fee_paid_at !== null;
    $wording ??= [
        'title' => 'Quittance de loyer',
        'amount_line' => 'Loyer acquitté',
        'attestation' => 'Cette quittance atteste du règlement du loyer pour la période indiquée.',
    ];
@endphp

@section('content')
    <h1>{{ $wording['title'] }}</h1>
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
            <th>{{ $wording['amount_line'] }}</th>
            <td class="amount"><strong>@currency($payment->amount, $currency)</strong></td>
        </tr>
        {{-- TCK-593 — la pénalité sur sa propre ligne ; elle ne s'additionne au loyer que réglée. --}}
        @if ($lateFee > 0)
        <tr>
            <th>Pénalité de retard</th>
            <td class="amount">
                @currency($lateFee, $currency)
                — {{ $lateFeePaid ? 'acquittée' : 'restant due, à régler auprès de l’agence' }}
            </td>
        </tr>
        @endif
        @if ($lateFeePaid)
        <tr>
            <th>Total acquitté</th>
            <td class="amount"><strong>@currency((float) $payment->amount + $lateFee, $currency)</strong></td>
        </tr>
        @endif
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
            <td><span class="pill">Acquitté</span></td>
        </tr>
    </table>

    <p class="muted">
        {{ $wording['attestation'] }}
        Elle ne vaut pas lettre de décharge pour les autres sommes dues au titre du bail.
    </p>
@endsection
