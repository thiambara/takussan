@extends('pdf.layouts.base')

@php
    /**
     * TCK-2897 (ADR-0099, amendement du 2026-11-15) — la facture d'intervention, rendue par
     * App\Http\Controllers\Api\ServiceProviderBillPdfController.
     *
     * Variables : $bill (avec maintenanceRequest, property, provider), $provider, $locale. Chaque
     * libellé passe par `maintenance.bill_pdf.*` (statuts : `maintenance.bill_statement_pdf.statuses.*`)
     * dans la langue du LECTEUR. Le montant s'écrit par `@currency` (XOF sans sous-unité, principe 3).
     */
    $t = fn (string $key, array $params = []) => __('maintenance.bill_pdf.'.$key, $params, $locale);
    $providerName = $provider ? (trim(($provider->first_name ?? '').' '.($provider->last_name ?? '')) ?: ($provider->username ?? '—')) : '—';
    $day = fn ($date) => $date?->locale($locale)->isoFormat('LL') ?? '—';
@endphp

@section('content')
    <h1>{{ $t('title') }}</h1>

    <table class="kv">
        <tr><th>{{ $t('reference') }}</th><td>{{ $bill->reference_number ?? '—' }}</td></tr>
        @if ($bill->provider_reference)
            <tr><th>{{ $t('provider_reference') }}</th><td>{{ $bill->provider_reference }}</td></tr>
        @endif
        <tr><th>{{ $t('date') }}</th><td>{{ $day($bill->submitted_at ?? $bill->created_at) }}</td></tr>
        <tr><th>{{ $t('provider') }}</th><td>{{ $providerName }}</td></tr>
        <tr><th>{{ $t('request') }}</th><td>{{ $bill->maintenanceRequest?->title ?? '—' }}</td></tr>
        <tr><th>{{ $t('property') }}</th><td>{{ $bill->property?->title ?? '—' }}</td></tr>
        <tr><th>{{ $t('status') }}</th><td>{{ __('maintenance.bill_statement_pdf.statuses.'.$bill->status->value, [], $locale) }}</td></tr>
    </table>

    <table class="data">
        <tfoot>
            <tr>
                <th>{{ $t('amount') }}</th>
                <td class="right amount"><strong>@currency((float) $bill->amount, $bill->currency ?? 'XOF')</strong></td>
            </tr>
        </tfoot>
    </table>
@endsection
