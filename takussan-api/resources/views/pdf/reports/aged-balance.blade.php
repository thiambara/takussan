@extends('pdf.layouts.base')

@php
    // TCK-2866 — la balance âgée des impayés d'une agence (ou d'un de ses bailleurs), imprimée depuis
    // la lecture même de l'écran (`AgingBalanceService::forAgency()`) : mêmes tranches, mêmes montants.
    $currency = 'XOF';
    $buckets = array_keys(\App\Services\Reporting\AgingBalanceService::BUCKETS);
    $asOf = \Illuminate\Support\Carbon::parse($balance['as_of'])->format('d/m/Y');
    $groupLabel = $balance['group_by'] === 'landlord' ? __('aged_balance.landlord') : __('aged_balance.tenant');
@endphp

@section('content')
    <h1>{{ __('aged_balance.title') }}</h1>

    <table class="kv">
        <tr><th>{{ __('aged_balance.agency') }}</th><td>{{ $agency?->legal_name ?: $agency?->name }}</td></tr>
        <tr><th>{{ __('aged_balance.landlord') }}</th><td>{{ $landlord_name ?? __('aged_balance.all_landlords') }}</td></tr>
        <tr><th>{{ __('aged_balance.as_of') }}</th><td>{{ $asOf }}</td></tr>
    </table>

    {{-- Les quatre tranches et le total : les cellules `buckets` et `total` de la lecture JSON. --}}
    <table class="data" data-section="tranches">
        <thead>
            <tr>
                <th></th>
                @foreach ($buckets as $bucket)
                    <th class="right">{{ __('aged_balance.buckets.'.$bucket) }}</th>
                @endforeach
                <th class="right">{{ __('aged_balance.total') }}</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>{{ __('aged_balance.count') }}</td>
                @foreach ($buckets as $bucket)
                    <td class="right">{{ $balance['buckets'][$bucket]['count'] }}</td>
                @endforeach
                <td class="right">{{ $balance['total']['count'] }}</td>
            </tr>
            <tr>
                <td>{{ __('aged_balance.total') }}</td>
                @foreach ($buckets as $bucket)
                    <td class="right amount">@currency($balance['buckets'][$bucket]['amount'], $currency)</td>
                @endforeach
                <td class="right amount"><strong>@currency($balance['total']['amount'], $currency)</strong></td>
            </tr>
        </tbody>
    </table>

    @if ($balance['rows'] === [])
        <p class="muted">{{ __('aged_balance.none') }}</p>
    @else
        <table class="data" data-section="lignes">
            <thead>
                <tr>
                    <th>{{ $groupLabel }}</th>
                    @foreach ($buckets as $bucket)
                        <th class="right">{{ __('aged_balance.buckets.'.$bucket) }}</th>
                    @endforeach
                    <th class="right">{{ __('aged_balance.total') }}</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($balance['rows'] as $row)
                    <tr>
                        <td>{{ $row['name'] ?: __('aged_balance.unnamed') }}</td>
                        @foreach ($buckets as $bucket)
                            <td class="right amount">@currency($row['buckets'][$bucket]['amount'], $currency)</td>
                        @endforeach
                        <td class="right amount">@currency($row['total']['amount'], $currency)</td>
                    </tr>
                @endforeach
            </tbody>
            <tfoot>
                <tr>
                    <td>{{ __('aged_balance.total') }}</td>
                    @foreach ($buckets as $bucket)
                        <td class="right amount">@currency($balance['buckets'][$bucket]['amount'], $currency)</td>
                    @endforeach
                    <td class="right amount">@currency($balance['total']['amount'], $currency)</td>
                </tr>
            </tfoot>
        </table>
    @endif

    <table class="kv">
        <tr><th>{{ __('aged_balance.deposits_held') }}</th><td class="amount">@currency($balance['deposits_held']['total'], $currency)</td></tr>
    </table>
@endsection
