@php
    /**
     * Shared layout for generated business documents (TCK-077).
     * Child templates extend via @extends('pdf.layouts.base') and provide:
     *   - $title : <title> tag
     *   - $document_label : displayed in the header badge
     *   - @section('content')…@endsection : main body
     * Optionally:
     *   - $agency, $agency_logo_url : rendered in the header
     *   - $footer_note : override default "Document généré le … — Takussan"
     */
    $docTitle = $title ?? 'Document';
    $label = $document_label ?? $docTitle;
    $footerNote = $footer_note ?? ('Document généré le '.now()->translatedFormat('d/m/Y H:i').' — Takussan');
    $agencyName = $agency->name ?? 'Takussan';
@endphp
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $docTitle }}</title>
    <style>
        @page {
            margin: 24mm 18mm 28mm 18mm;
        }
        * { box-sizing: border-box; }
        body {
            font-family: DejaVu Sans, Arial, Helvetica, sans-serif;
            color: #1f2937;
            font-size: 11pt;
            line-height: 1.45;
            margin: 0;
        }
        header.pdf-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #111827;
            padding-bottom: 12px;
            margin-bottom: 20px;
        }
        header.pdf-header .brand { font-size: 18pt; font-weight: 700; color: #111827; }
        header.pdf-header .brand img { max-height: 42px; max-width: 160px; display: block; }
        header.pdf-header .label {
            background: #111827;
            color: #fff;
            padding: 6px 12px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: .08em;
            font-size: 9pt;
            font-weight: 600;
        }
        main.pdf-body { min-height: 140mm; }
        h1, h2, h3 { color: #111827; margin-top: 0; }
        h1 { font-size: 20pt; margin: 0 0 8px; }
        h2 { font-size: 14pt; margin: 24px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        table.kv { width: 100%; border-collapse: collapse; margin: 8px 0 18px; }
        table.kv th, table.kv td { text-align: left; padding: 6px 8px; vertical-align: top; }
        table.kv th { width: 35%; font-weight: 600; color: #374151; background: #f9fafb; }
        table.data { width: 100%; border-collapse: collapse; margin: 12px 0; }
        table.data th, table.data td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
        table.data th { background: #f3f4f6; font-weight: 600; }
        table.data tfoot td { font-weight: 700; border-top: 2px solid #111827; }
        .muted { color: #6b7280; }
        .right { text-align: right; }
        .amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
        .pill {
            display: inline-block; padding: 2px 8px; border-radius: 999px;
            background: #eef2ff; color: #3730a3; font-size: 9pt; font-weight: 600;
        }
        footer.pdf-footer {
            position: fixed;
            bottom: -18mm;
            left: 0;
            right: 0;
            border-top: 1px solid #e5e7eb;
            padding-top: 6px;
            font-size: 9pt;
            color: #6b7280;
            display: flex;
            justify-content: space-between;
        }
        .page-number:before { content: counter(page); }
        .page-total:before { content: counter(pages); }
    </style>
</head>
<body>
    <header class="pdf-header">
        <div class="brand">
            @if (! empty($agency_logo_url))
                <img src="{{ $agency_logo_url }}" alt="{{ $agencyName }}">
            @else
                {{ $agencyName }}
            @endif
        </div>
        <div class="label">{{ $label }}</div>
    </header>

    <main class="pdf-body">
        @yield('content')
    </main>

    <footer class="pdf-footer">
        <span>{{ $footerNote }}</span>
        <span>Page <span class="page-number"></span> sur <span class="page-total"></span></span>
    </footer>
</body>
</html>
