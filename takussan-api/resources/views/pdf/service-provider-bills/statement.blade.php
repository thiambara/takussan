@extends('pdf.layouts.base')

@php
    /**
     * TCK-2911 (ADR-0120 § 2) — « Relevé de mes factures », rendu par
     * App\Http\Controllers\Api\ServiceProviderBillStatementController.
     *
     * Variables : $bills (factures du prestataire, hors brouillons), $totals (par devise : billed,
     * paid), $provider, $from, $to, $locale. Chaque libellé passe par `maintenance.bill_statement_pdf.*`
     * dans la langue du LECTEUR.
     */
    $t = fn (string $key, array $params = []) => __('maintenance.bill_statement_pdf.'.$key, $params, $locale);
    $providerName = trim(($provider->first_name ?? '').' '.($provider->last_name ?? '')) ?: ($provider->username ?? '—');
    $day = fn ($date) => $date?->locale($locale)->isoFormat('L') ?? '—';
@endphp

@section('content')
    <h1>{{ $t('title') }}</h1>

    <table class="kv">
        <tr><th>{{ $t('provider') }}</th><td>{{ $providerName }}</td></tr>
        <tr><th>{{ $t('period') }}</th><td>{{ $day($from) }} — {{ $day($to) }}</td></tr>
    </table>

    @if ($bills->isEmpty())
        <p class="muted">{{ $t('empty') }}</p>
    @else
        <table class="data">
            <thead>
                <tr>
                    <th>{{ $t('reference') }}</th>
                    <th>{{ $t('date') }}</th>
                    <th>{{ $t('request') }}</th>
                    <th>{{ $t('property') }}</th>
                    <th>{{ $t('status') }}</th>
                    <th class="right">{{ $t('amount') }}</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($bills as $bill)
                    <tr>
                        <td>{{ $bill->reference_number }}@if ($bill->provider_reference)<div class="muted">{{ $bill->provider_reference }}</div>@endif</td>
                        <td>{{ $day($bill->submitted_at ?? $bill->created_at) }}</td>
                        <td>{{ $bill->maintenanceRequest?->title ?? '—' }}</td>
                        <td>{{ $bill->property?->title ?? '—' }}</td>
                        <td>{{ $t('statuses.'.$bill->status->value) }}</td>
                        <td class="right amount">@currency((float) $bill->amount, $bill->currency ?? 'XOF')</td>
                    </tr>
                @endforeach
            </tbody>
            <tfoot>
                @foreach ($totals as $currency => $total)
                    <tr>
                        <th colspan="5">{{ $t('billed_total') }}</th>
                        <td class="right amount"><strong>@currency($total['billed'], $currency)</strong></td>
                    </tr>
                    <tr>
                        <th colspan="5">{{ $t('paid_total') }}</th>
                        <td class="right amount">@currency($total['paid'], $currency)</td>
                    </tr>
                @endforeach
            </tfoot>
        </table>
    @endif
@endsection
