@extends('pdf.layouts.base')

@php
    // TCK-594 (ADR-0039 §3) — le relevé de gérance d'un bailleur. Les libellés viennent de
    // `money_out.statement.*` ; les mentions légales de l'agence s'impriment quand elles existent.
    $currency = $statement['currency'] ?? 'XOF';
    $legal = array_filter([
        __('money_out.legal.ninea') => $agency?->ninea,
        __('money_out.legal.rccm') => $agency?->rccm,
    ], static fn ($value): bool => is_string($value) && trim($value) !== '');
@endphp

@section('content')
    <h1>{{ __($statement['annual'] ? 'money_out.statement.annual_title' : 'money_out.statement.title') }}</h1>

    <table class="kv">
        <tr><th>{{ __('money_out.statement.agency') }}</th><td>{{ $agency?->legal_name ?: $statement['agency']['name'] }}</td></tr>
        <tr><th>{{ __('money_out.statement.landlord') }}</th><td>{{ $statement['landlord']['name'] }}</td></tr>
        <tr><th>{{ __('money_out.statement.period') }}</th><td>{{ $statement['period_start'] }} — {{ $statement['period_end'] }}</td></tr>
    </table>

    <table class="data">
        <thead>
            <tr>
                <th>{{ __('money_out.statement.property') }}</th>
                <th class="right">{{ __('money_out.statement.collected') }}</th>
                <th class="right">{{ __('money_out.statement.commission') }}</th>
                <th class="right">{{ __('money_out.statement.fees') }}</th>
                <th class="right">{{ __('money_out.statement.net') }}</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($statement['properties'] as $row)
                <tr>
                    <td>#{{ $row['property_id'] }}</td>
                    <td class="right amount">@currency($row['collected'], $currency)</td>
                    <td class="right amount">@currency($row['commission'], $currency)</td>
                    <td class="right amount">@currency($row['fees'], $currency)</td>
                    <td class="right amount">@currency($row['net'], $currency)</td>
                </tr>
            @endforeach
        </tbody>
        <tfoot>
            <tr>
                <td>{{ __('money_out.statement.total') }}</td>
                <td class="right amount">@currency($statement['totals']['gross'], $currency)</td>
                <td class="right amount">@currency($statement['totals']['commission'], $currency)</td>
                <td class="right amount">@currency($statement['totals']['fees'], $currency)</td>
                <td class="right amount"><strong>@currency($statement['totals']['net'], $currency)</strong></td>
            </tr>
        </tfoot>
    </table>

    @if ($statement['payouts'] !== [])
        <h2>{{ __('money_out.statement.payouts') }}</h2>
        <table class="data">
            <thead>
                <tr>
                    <th>{{ __('money_out.statement.reference') }}</th>
                    <th>{{ __('money_out.statement.date') }}</th>
                    <th class="right">{{ __('money_out.statement.paid_out') }}</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($statement['payouts'] as $payout)
                    <tr>
                        <td>{{ $payout['reference_number'] }}@if ($payout['transaction_id']) ({{ $payout['transaction_id'] }})@endif</td>
                        <td>{{ $payout['processed_at'] ? substr($payout['processed_at'], 0, 10) : '—' }}</td>
                        <td class="right amount">@currency($payout['net_amount'], $currency)</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    @if (($statement['unpaid']['count'] ?? 0) > 0)
        <p>{{ __('money_out.statement.unpaid') }} : {{ $statement['unpaid']['count'] }} — @currency($statement['unpaid']['amount'], $currency)</p>
    @endif

    @if ($legal !== [])
        <p class="muted legal-mentions">
            @foreach ($legal as $label => $value)
                {{ $label }} : {{ $value }}@if (! $loop->last) — @endif
            @endforeach
        </p>
    @endif
@endsection
