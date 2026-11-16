@extends('pdf.layouts.base')

@php
    // TCK-2909 — l'avis de versement d'un reversement au bailleur, terminé. Les libellés viennent de
    // `money_out.notice.*` ; la destination n'est imprimée que masquée (ADR-0039 § 6). Les montants
    // passent par `@currency` (XOF sans sous-unité, principe n° 3). Les jours en jour/mois/année.
    $currency = $payout->currency?->value ?? 'XOF';
    $day = static fn ($value): ?string => $value === null ? null : \Illuminate\Support\Carbon::parse($value)->timezone('Africa/Dakar')->format('d/m/Y');
    $method = $payout->payment_method?->value;
    $nature = $payout->nature?->value;
    $clawback = (float) ($payout->clawback_amount ?? 0);
    $fees = (float) ($payout->fees_amount ?? 0);
@endphp

@section('content')
    <h1>{{ __('money_out.notice.title') }}</h1>
    <p class="muted">{{ __('money_out.statement.reference') }} : {{ $payout->reference_number ?? '#'.$payout->id }}</p>

    <table class="kv">
        <tr><th>{{ __('money_out.statement.agency') }}</th><td>{{ $agency?->legal_name ?: $agency?->name }}</td></tr>
        <tr><th>{{ __('money_out.statement.landlord') }}</th><td>
            @if (! empty($company_name))
                {{ $company_name }}
                <div class="muted">{{ \App\Services\Pdf\PrintedName::of($landlord) }}</div>
            @else
                {{ \App\Services\Pdf\PrintedName::of($landlord) }}
            @endif
        </td></tr>
        @if ($nature)
            <tr><th>{{ __('money_out.notice.nature') }}</th><td>{{ __('money_out.notice.natures.'.$nature) }}</td></tr>
        @endif
        @if ($payout->period_start && $payout->period_end)
            <tr><th>{{ __('money_out.statement.period') }}</th><td>{{ $payout->period_start->format('d/m/Y') }} — {{ $payout->period_end->format('d/m/Y') }}</td></tr>
        @endif
        <tr><th>{{ __('money_out.notice.paid_on') }}</th><td>{{ $day($payout->processed_at) }}</td></tr>
        <tr><th>{{ __('money_out.notice.method') }}</th><td>
            {{ $method ? __('money_out.notice.methods.'.$method) : '—' }}
            @if ($destination)
                <div class="muted">{{ $destination }}</div>
            @endif
        </td></tr>
        @if ($payout->transaction_id)
            <tr><th>{{ __('money_out.notice.transaction') }}</th><td>{{ $payout->transaction_id }}</td></tr>
        @endif
    </table>

    <table class="data">
        <tbody>
            <tr><td>{{ __('money_out.statement.gross') }}</td><td class="right amount">@currency((float) $payout->gross_amount, $currency)</td></tr>
            <tr><td>{{ __('money_out.statement.commission') }}</td><td class="right amount">− @currency((float) $payout->commission_amount, $currency)</td></tr>
            @if ($fees > 0)
                <tr><td>{{ __('money_out.statement.fees') }}</td><td class="right amount">− @currency($fees, $currency)</td></tr>
            @endif
            @if ($clawback > 0)
                <tr><td>{{ __('money_out.statement.clawback') }}</td><td class="right amount">− @currency($clawback, $currency)</td></tr>
            @endif
        </tbody>
        <tfoot>
            <tr><td>{{ __('money_out.notice.net') }}</td><td class="right amount"><strong>@currency((float) $payout->net_amount, $currency)</strong></td></tr>
        </tfoot>
    </table>

    <p class="muted">{{ __('money_out.notice.attestation') }}</p>
@endsection
