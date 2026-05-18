<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Quittance {{ $reference ?? '' }}</title>
    <style>
        body { font-family: 'DejaVu Sans', sans-serif; color: #1c1917; font-size: 12px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .muted { color: #78716c; }
        .header { border-bottom: 2px solid #1c1917; padding-bottom: 12px; margin-bottom: 20px; }
        .grid { width: 100%; border-collapse: collapse; }
        .grid td { padding: 6px 0; vertical-align: top; }
        .grid td.label { color: #78716c; width: 35%; }
        .amount { font-size: 24px; font-weight: bold; margin: 24px 0; }
        .stamp {
            display: inline-block; border: 2px solid #16a34a; color: #16a34a;
            padding: 4px 12px; border-radius: 8px; text-transform: uppercase;
            font-weight: bold; letter-spacing: 1px;
        }
        .footer { margin-top: 40px; font-size: 10px; color: #a8a29e; border-top: 1px solid #e7e5e4; padding-top: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Quittance de paiement</h1>
        <p class="muted">Référence : {{ $reference ?? '—' }}</p>
        <p><span class="stamp">Acquittée</span></p>
    </div>

    <table class="grid">
        @if($agency)
            <tr><td class="label">Émise par</td><td>{{ $agency->name ?? 'Agence' }}</td></tr>
        @endif
        @if($customer)
            <tr><td class="label">Bénéficiaire</td><td>{{ trim(($customer->first_name ?? '').' '.($customer->last_name ?? '')) ?: ($customer->email ?? '—') }}</td></tr>
        @endif
        @if($property)
            <tr><td class="label">Bien</td><td>{{ $property->title ?? '—' }}</td></tr>
        @endif
        <tr><td class="label">Contexte</td><td>{{ $context_label }}</td></tr>
        <tr><td class="label">Type</td><td>{{ $type ?? '—' }}</td></tr>
        <tr><td class="label">Méthode</td><td>{{ $method ?? '—' }}</td></tr>
        <tr><td class="label">Date du paiement</td><td>{{ optional($paid_at)->format('d/m/Y H:i') ?? '—' }}</td></tr>
    </table>

    <div class="amount">
        {{ number_format($amount, 0, ',', ' ') }} {{ $currency }}
    </div>

    <div class="footer">
        Document généré automatiquement le {{ now()->format('d/m/Y H:i') }}.
        En cas de question, contactez votre agence en citant la référence ci-dessus.
    </div>
</body>
</html>
