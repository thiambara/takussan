<?php

namespace App\Services\Pdf;

use Spatie\LaravelPdf\Drivers\DomPdfDriver;
use Spatie\LaravelPdf\PdfOptions;

/**
 * TCK-1235 (P109.02) — le total de pages sous dompdf.
 *
 * Le pied commun écrit « Page <counter(page)> sur <counter(pages)> » (`pdf.layouts.base`,
 * TCK-077 AC6). dompdf évalue `counter(pages)` pendant la mise en page, avant de connaître le
 * total : il imprimait « Page 1 sur 0 ». Ce pilote rend donc le document une première fois pour
 * compter ses pages, puis le rend à nouveau avec le total écrit dans `.page-total`.
 *
 * Seul un HTML qui porte `.page-total` paie le second rendu. Ni `isPhpEnabled` ni
 * `is_remote_enabled` ne s'ouvrent, et les autres pilotes de `spatie/laravel-pdf` ne changent
 * pas : la liaison remplacée est la seule `laravel-pdf.driver.dompdf` (`AppServiceProvider`).
 */
class DomPdfPageTotalDriver extends DomPdfDriver
{
    public const PAGE_TOTAL_CLASS = 'page-total';

    public function generatePdf(string $html, ?string $headerHtml, ?string $footerHtml, PdfOptions $options): string
    {
        $dompdf = $this->buildDompdf($html, $headerHtml, $footerHtml, $options);
        $dompdf->render();

        if (! str_contains($html, self::PAGE_TOTAL_CLASS)) {
            return $dompdf->output();
        }

        $total = $dompdf->getCanvas()->get_page_count();

        $second = $this->buildDompdf($this->withPageTotal($html, $total), $headerHtml, $footerHtml, $options);
        $second->render();

        return $second->output();
    }

    /** La règle vient après la feuille du gabarit : à spécificité égale, elle l'emporte. */
    private function withPageTotal(string $html, int $total): string
    {
        $css = sprintf('<style>.%s:before { content: "%d"; }</style>', self::PAGE_TOTAL_CLASS, $total);

        if (preg_match('#</head>#i', $html)) {
            return (string) preg_replace('#</head>#i', $css.'</head>', $html, 1);
        }

        return $css.$html;
    }
}
