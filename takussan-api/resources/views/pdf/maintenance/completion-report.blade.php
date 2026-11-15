@extends('pdf.layouts.base')

@php
    /**
     * TCK-2897 (ADR-0099, amendement du 2026-11-15) — le rapport de fin d'intervention, rendu par
     * App\Http\Controllers\Api\MaintenanceCompletionReportController.
     *
     * Variables : $mr, $property, $provider, $before et $after (photos en URI `data:`), $locale. Chaque
     * libellé passe par `maintenance.completion_report_pdf.*` dans la langue du LECTEUR. Le coût s'écrit
     * par `@currency` (XOF sans sous-unité, principe 3).
     */
    $t = fn (string $key, array $params = []) => __('maintenance.completion_report_pdf.'.$key, $params, $locale);
    $providerName = $provider ? (trim(($provider->first_name ?? '').' '.($provider->last_name ?? '')) ?: ($provider->username ?? '—')) : '—';
    $day = fn ($date) => $date?->locale($locale)->isoFormat('LL') ?? '—';
@endphp

@section('content')
    <h1>{{ $t('title') }}</h1>

    <table class="kv">
        <tr><th>{{ $t('request') }}</th><td>{{ $mr->title }}</td></tr>
        <tr><th>{{ $t('property') }}</th><td>{{ $property?->title ?? '—' }}</td></tr>
        <tr><th>{{ $t('provider') }}</th><td>{{ $providerName }}</td></tr>
        <tr><th>{{ $t('reported_at') }}</th><td>{{ $day($mr->created_at) }}</td></tr>
        @if ($mr->started_at)
            <tr><th>{{ $t('started_at') }}</th><td>{{ $day($mr->started_at) }}</td></tr>
        @endif
        <tr><th>{{ $t('completed_at') }}</th><td>{{ $day($mr->completed_at) }}</td></tr>
        @if ($mr->actual_cost !== null)
            <tr><th>{{ $t('cost') }}</th><td class="amount">@currency((float) $mr->actual_cost, $mr->quote_currency ?? 'XOF')</td></tr>
        @endif
    </table>

    <h2>{{ $t('description') }}</h2>
    <p>{{ $mr->description ?: '—' }}</p>

    <h2>{{ $t('resolution') }}</h2>
    @if (filled($mr->resolution_notes))
        <p>{!! nl2br(e($mr->resolution_notes)) !!}</p>
    @else
        <p class="muted">{{ $t('no_notes') }}</p>
    @endif

    @foreach (['photos_before' => $before, 'photos_after' => $after] as $label => $photos)
        <h2>{{ $t($label) }}</h2>
        @if ($photos === [])
            <p class="muted">{{ $t('no_photos') }}</p>
        @else
            <div>
                @foreach ($photos as $photo)
                    <img src="{{ $photo }}" alt="{{ $t($label) }}" style="max-width: 48%; max-height: 220px; margin: 0 4px 6px 0;">
                @endforeach
            </div>
        @endif
    @endforeach
@endsection
