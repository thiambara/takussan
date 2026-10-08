@extends('pdf.layouts.base')

@php
    // Expected variables:
    //   $lease, $landlord, $tenant, $property, $agency, $guarantors (collection|array)
    // TCK-084 — currency follows the lease (locked at signature) with the
    // agency's current currency as a fallback for legacy rows.
    $currency = $lease->currency ?? $agency?->currency ?? 'XOF';
    $guarantors = $guarantors ?? collect();
    $start = $lease->start_date?->translatedFormat('d/m/Y') ?? '—';
    $end = $lease->end_date?->translatedFormat('d/m/Y') ?? 'indéterminée';
    // TCK-596 (VERIF-596 M2, ADR-0042 §1) — le contrat signé imprime TOUT ce que le bail exécute
    // après activation : chaque colonne de `Lease::CONTRACT_PRINTED_TERMS` a sa ligne ici, et
    // `LeaseContractTermsTest` rougit si l'une manque. Le préavis et l'indemnité de résiliation
    // anticipée sont ceux que `EarlyTerminationService` appliquera.
    $typeLabels = [
        'residential_rent' => 'Bail d\'habitation',
        'commercial_rent' => 'Bail commercial',
        'seasonal_rent' => 'Location saisonnière',
        'sale' => 'Vente',
    ];
    $frequencyLabels = ['monthly' => 'Mensuelle', 'quarterly' => 'Trimestrielle', 'yearly' => 'Annuelle'];
    $typeValue = $lease->type?->value ?? $lease->type;
    $frequencyValue = $lease->payment_frequency?->value ?? $lease->payment_frequency ?? 'monthly';
    $earlyTermination = app(\App\Services\Lease\EarlyTerminationService::class);
    $noticeDays = $earlyTermination->resolveNoticeDays($lease);
    $penaltyMonths = $earlyTermination->resolvePenaltyMonths();
    $number = fn ($value) => rtrim(rtrim(number_format((float) $value, 2, ',', ' '), '0'), ',');
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

    <h2>Nature du contrat</h2>
    <table class="kv">
        <tr>
            <th>Type</th>
            <td>{{ $typeLabels[$typeValue] ?? $typeValue ?? '—' }}</td>
        </tr>
    </table>

    <h2>Conditions financières</h2>
    <table class="kv">
        @if ($lease->sale_price !== null)
        <tr>
            <th>Prix de vente</th>
            <td class="amount"><strong>@currency($lease->sale_price, $currency)</strong></td>
        </tr>
        @endif
        <tr>
            <th>Loyer mensuel</th>
            <td class="amount"><strong>@currency($lease->monthly_rent, $currency)</strong></td>
        </tr>
        <tr>
            <th>Dépôt de garantie (caution)</th>
            <td class="amount">@currency($lease->deposit_amount, $currency)</td>
        </tr>
        <tr>
            <th>Fréquence de paiement</th>
            <td>{{ $frequencyLabels[$frequencyValue] ?? $frequencyValue }}</td>
        </tr>
        <tr>
            <th>Jour de paiement</th>
            <td>{{ $lease->payment_day ?? '—' }}</td>
        </tr>
        <tr>
            <th>Pénalité de retard</th>
            <td>
                @if ($lease->late_fee_percent !== null && (float) $lease->late_fee_percent > 0)
                    {{ $number($lease->late_fee_percent) }} % de l'échéance impayée,
                    après un délai de grâce de {{ (int) ($lease->late_fee_grace_days ?? 0) }} jour(s)
                @else
                    Aucune (délai de grâce : {{ (int) ($lease->late_fee_grace_days ?? 0) }} jour(s))
                @endif
            </td>
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
        @if ($lease->renewal_date !== null)
        <tr>
            <th>Date de renouvellement</th>
            <td>{{ $lease->renewal_date->translatedFormat('d/m/Y') }}</td>
        </tr>
        @endif
        <tr>
            <th>Préavis de résiliation anticipée</th>
            <td>{{ $noticeDays }} jour(s)</td>
        </tr>
        <tr>
            <th>Indemnité de résiliation anticipée</th>
            <td>{{ $penaltyMonths }} mois de loyer au plus, dans la limite des mois restant à courir</td>
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
        <h2>Conditions générales</h2>
        <p>{{ $lease->terms }}</p>
    @endif

    @if ($lease->special_conditions ?? false)
        <h2>Conditions particulières</h2>
        <p>{{ $lease->special_conditions }}</p>
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
