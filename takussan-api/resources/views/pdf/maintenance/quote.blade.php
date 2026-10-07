@extends('pdf.layouts.base')

@php
    /**
     * TCK-592 (P12) — devis d'intervention, rendu par App\Http\Controllers\Api\MaintenanceQuoteController::pdf().
     *
     * Variables : $mr, $lines (chaînes décimales), $amount, $currency, $property, $provider,
     * $agency, $locale. Chaque libellé passe par `maintenance.quote_pdf.*` dans la langue du
     * LECTEUR ($locale) — l'API n'écrit aucune prose en dur.
     */
    $t = fn (string $key, array $params = []) => __('maintenance.quote_pdf.'.$key, $params, $locale);
    $providerName = $provider ? (trim(($provider->first_name ?? '').' '.($provider->last_name ?? '')) ?: ($provider->username ?? '—')) : '—';
@endphp

@section('content')
    <h1>{{ $t('title') }}</h1>

    <table class="kv">
        <tr><th>{{ $t('request') }}</th><td>{{ $mr->title }}</td></tr>
        <tr><th>{{ $t('property') }}</th><td>{{ $property?->title ?? '—' }}</td></tr>
        <tr><th>{{ $t('provider') }}</th><td>{{ $providerName }}</td></tr>
        <tr><th>{{ $t('submitted_at') }}</th><td>{{ $mr->quote_submitted_at?->locale($locale)->isoFormat('LL') ?? '—' }}</td></tr>
        <tr><th>{{ $t('valid_until') }}</th><td>{{ $mr->quote_valid_until?->locale($locale)->isoFormat('LL') ?? '—' }}</td></tr>
        @if ($mr->quote_estimated_duration_days)
            <tr><th>{{ $t('duration') }}</th><td>{{ $t('duration_days', ['days' => $mr->quote_estimated_duration_days]) }}</td></tr>
        @endif
    </table>

    <table class="data">
        <thead>
            <tr>
                <th>{{ $t('label') }}</th>
                <th>{{ $t('kind') }}</th>
                <th class="right">{{ $t('quantity') }}</th>
                <th class="right">{{ $t('unit_price') }}</th>
                <th class="right">{{ $t('line_total') }}</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($lines as $line)
                <tr>
                    <td>{{ $line['label'] ?? '' }}</td>
                    <td>{{ $t('kinds.'.($line['kind'] ?? 'labour')) }}</td>
                    <td class="right amount">{{ rtrim(rtrim((string) ($line['quantity'] ?? '0'), '0'), '.') }}</td>
                    <td class="right amount">@currency((float) ($line['unit_price'] ?? 0), $currency)</td>
                    <td class="right amount">@currency((float) ($line['total'] ?? 0), $currency)</td>
                </tr>
            @endforeach
        </tbody>
        <tfoot>
            <tr>
                <th colspan="4">{{ $t('total') }}</th>
                <td class="right amount"><strong>@currency($amount, $currency)</strong></td>
            </tr>
        </tfoot>
    </table>
@endsection
