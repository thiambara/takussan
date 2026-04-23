@extends('pdf.layouts.base')

@php
    // Expected variables:
    //   $lease, $landlord, $tenant, $property, $agency, $guarantors (collection|array)
    $currency = $lease->currency?->value ?? $lease->currency ?? 'XOF';
    $fmt = fn ($n) => number_format((float) $n, 0, ',', ' ').' '.$currency;
    $guarantors = $guarantors ?? collect();
    $start = $lease->start_date?->translatedFormat('d/m/Y') ?? '—';
    $end = $lease->end_date?->translatedFormat('d/m/Y') ?? 'indéterminée';
@endphp

@section('content')
    <h1>Contrat de bail</h1>
    <p class="muted">Référence : {{ $lease->reference_number ?? 'LS-'.$lease->id }}</p>

    <h2>Parties</h2>
    <table class="kv">
        <tr>
            <th>Bailleur</th>
            <td>
                {{ trim(($landlord->first_name ?? '').' '.($landlord->last_name ?? $landlord->name ?? '')) ?: $landlord->email ?? '—' }}
                @if ($landlord->email ?? false)
                    <div class="muted">{{ $landlord->email }}</div>
                @endif
            </td>
        </tr>
        <tr>
            <th>Locataire</th>
            <td>
                {{ trim(($tenant->first_name ?? '').' '.($tenant->last_name ?? '')) }}
                @if ($tenant->email ?? false)
                    <div class="muted">{{ $tenant->email }}</div>
                @endif
            </td>
        </tr>
        @if ($agency)
        <tr>
            <th>Agence</th>
            <td>{{ $agency->name }}</td>
        </tr>
        @endif
    </table>

    <h2>Bien loué</h2>
    <table class="kv">
        <tr>
            <th>Adresse</th>
            <td>{{ $property->address?->full_address ?? $property->title ?? 'Bien n°'.$property->id }}</td>
        </tr>
        @if ($property->title ?? false)
        <tr>
            <th>Désignation</th>
            <td>{{ $property->title }}</td>
        </tr>
        @endif
    </table>

    <h2>Conditions financières</h2>
    <table class="kv">
        <tr>
            <th>Loyer mensuel</th>
            <td class="amount"><strong>{{ $fmt($lease->monthly_rent) }}</strong></td>
        </tr>
        <tr>
            <th>Dépôt de garantie (caution)</th>
            <td class="amount">{{ $fmt($lease->deposit_amount) }}</td>
        </tr>
        <tr>
            <th>Fréquence de paiement</th>
            <td>{{ $lease->payment_frequency?->value ?? $lease->payment_frequency ?? 'monthly' }}</td>
        </tr>
        <tr>
            <th>Jour de paiement</th>
            <td>{{ $lease->payment_day ?? '—' }}</td>
        </tr>
    </table>

    <h2>Durée</h2>
    <table class="kv">
        <tr>
            <th>Début</th>
            <td>{{ $start }}</td>
        </tr>
        <tr>
            <th>Fin</th>
            <td>{{ $end }}</td>
        </tr>
    </table>

    @if (count($guarantors) > 0)
        <h2>Garants</h2>
        <table class="data">
            <thead>
                <tr>
                    <th>Nom</th>
                    <th>Contact</th>
                    <th>Rôle</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($guarantors as $g)
                    <tr>
                        <td>{{ trim(($g->first_name ?? '').' '.($g->last_name ?? '')) }}</td>
                        <td>
                            @if ($g->email ?? false){{ $g->email }}<br>@endif
                            @if ($g->phone ?? false){{ $g->phone }}@endif
                        </td>
                        <td>{{ $g->pivot->role ?? $g->role ?? '—' }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    @if ($lease->terms ?? false)
        <h2>Conditions particulières</h2>
        <p>{{ $lease->terms }}</p>
    @endif

    <h2>Signatures</h2>
    <table class="kv">
        <tr>
            <th>Le bailleur</th>
            <td style="height: 60px;"></td>
        </tr>
        <tr>
            <th>Le locataire</th>
            <td style="height: 60px;"></td>
        </tr>
    </table>
@endsection
