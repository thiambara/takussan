@extends('pdf.layouts.base')

@php
    /**
     * Expected variables:
     *   - $inventory (Inventory)
     *   - $lease, $property, $tenant, $agency
     *   - $landlord (User|null)  — owner of the property
     *   - $room_photos (array<string, array<string>>)  — room_name ⇒ [url, ...]
     *   - $tenant_signature (?string) — data URL
     *   - $owner_signature (?string)  — data URL
     *   - $traceability_hash (string) — short fingerprint, rendered in the footer area
     */
    $type = $inventory->type?->value ?? 'move_in';
    $typeLabel = $type === 'move_out' ? 'État des lieux de sortie' : 'État des lieux d\'entrée';
    $conductedAt = $inventory->conducted_at?->translatedFormat('d/m/Y H:i') ?? '—';
    $status = $inventory->status?->value ?? 'draft';
    $generalCondition = $inventory->general_condition?->value ?? '—';
    $rooms = is_array($inventory->rooms) ? $inventory->rooms : [];
    $roomPhotos = $room_photos ?? [];
    $tenantSignature = $tenant_signature ?? null;
    $ownerSignature = $owner_signature ?? null;
    $traceability = $traceability_hash ?? '—';
    $tenantSignedAt = $inventory->tenant_signed_at?->translatedFormat('d/m/Y H:i');
    $ownerSignedAt = $inventory->owner_signed_at?->translatedFormat('d/m/Y H:i');
    $signedAt = $inventory->signed_at?->translatedFormat('d/m/Y H:i');
@endphp

@section('content')
    <h1>{{ $typeLabel }}</h1>
    <p class="muted">
        Référence : INV-{{ $inventory->id }}
        @if ($lease ?? false)
            · Bail {{ $lease->reference_number ?? 'LS-'.$lease->id }}
        @endif
    </p>

    <h2>Bien concerné</h2>
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

    <h2>Parties</h2>
    <table class="kv">
        @if ($tenant ?? false)
        <tr>
            <th>Locataire</th>
            <td>
                {{ trim(($tenant->first_name ?? '').' '.($tenant->last_name ?? '')) ?: ($tenant->email ?? '—') }}
                @if ($tenant->email ?? false)<div class="muted">{{ $tenant->email }}</div>@endif
            </td>
        </tr>
        @endif
        @if ($landlord ?? false)
        <tr>
            <th>Bailleur</th>
            <td>
                {{ trim(($landlord->first_name ?? '').' '.($landlord->last_name ?? $landlord->name ?? '')) ?: ($landlord->email ?? '—') }}
                @if ($landlord->email ?? false)<div class="muted">{{ $landlord->email }}</div>@endif
            </td>
        </tr>
        @endif
        @if ($agency ?? false)
        <tr>
            <th>Agence</th>
            <td>{{ $agency->name }}</td>
        </tr>
        @endif
    </table>

    <h2>Synthèse</h2>
    <table class="kv">
        <tr>
            <th>Date de réalisation</th>
            <td>{{ $conductedAt }}</td>
        </tr>
        <tr>
            <th>État général</th>
            <td>{{ $generalCondition }}</td>
        </tr>
        <tr>
            <th>Statut</th>
            <td><span class="pill">{{ $status }}</span></td>
        </tr>
        @if ($signedAt)
        <tr>
            <th>Signé le</th>
            <td>{{ $signedAt }}</td>
        </tr>
        @endif
    </table>

    @if ($inventory->notes)
        <h2>Notes</h2>
        <p style="white-space: pre-wrap;">{{ $inventory->notes }}</p>
    @endif

    <h2>Pièces ({{ count($rooms) }})</h2>
    @foreach ($rooms as $room)
        @php
            $roomName = $room['name'] ?? 'Pièce';
            $roomCondition = $room['condition'] ?? '—';
            $roomNotes = $room['notes'] ?? null;
            $elements = $room['elements'] ?? [];
            $photos = $roomPhotos[$roomName] ?? [];
        @endphp
        <div style="margin-bottom: 14px; padding: 10px 12px; background: #f9fafb; border-radius: 6px;">
            <strong>{{ $roomName }}</strong> — <span class="muted">état : {{ $roomCondition }}</span>
            @if ($roomNotes)
                <div style="margin-top: 4px; font-size: 10pt;">{{ $roomNotes }}</div>
            @endif

            @if (! empty($elements))
                <table class="data" style="margin-top: 8px;">
                    <thead>
                        <tr>
                            <th>Élément</th>
                            <th>État</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($elements as $el)
                            <tr>
                                <td>{{ $el['label'] ?? '—' }}</td>
                                <td>{{ $el['state'] ?? '—' }}</td>
                                <td class="muted">{{ $el['notes'] ?? '' }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            @endif

            @if (! empty($photos))
                <div style="margin-top: 8px;">
                    @foreach ($photos as $photoUrl)
                        <img src="{{ $photoUrl }}" alt="{{ $roomName }}"
                             style="max-width: 48%; max-height: 120px; margin: 4px 2px; border: 1px solid #e5e7eb; border-radius: 4px;">
                    @endforeach
                </div>
            @endif
        </div>
    @endforeach

    <h2>Signatures</h2>
    <table class="kv">
        <tr>
            <th style="width: 35%;">Locataire</th>
            <td style="min-height: 80px;">
                @if ($tenantSignature)
                    <img src="{{ $tenantSignature }}" alt="Signature locataire"
                         style="max-height: 70px; max-width: 260px;">
                    <div class="muted" style="margin-top: 4px;">Signé le {{ $tenantSignedAt ?? '—' }}</div>
                @else
                    <em class="muted">En attente</em>
                @endif
            </td>
        </tr>
        <tr>
            <th>Bailleur</th>
            <td style="min-height: 80px;">
                @if ($ownerSignature)
                    <img src="{{ $ownerSignature }}" alt="Signature bailleur"
                         style="max-height: 70px; max-width: 260px;">
                    <div class="muted" style="margin-top: 4px;">Signé le {{ $ownerSignedAt ?? '—' }}</div>
                @else
                    <em class="muted">En attente</em>
                @endif
            </td>
        </tr>
    </table>

    <p class="muted" style="margin-top: 18px; font-size: 9pt;">
        Empreinte de traçabilité : <code>{{ $traceability }}</code>
    </p>
@endsection
