<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\OwnerStatementRequest;
use App\Services\Payout\OwnerStatementService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TCK-594 (ADR-0039 §3) — le relevé de gérance : JSON, PDF, CSV. Les trois lisent le même calcul.
 */
class OwnerStatementController extends Controller
{
    public function __construct(
        private readonly OwnerStatementService $statements,
        private readonly DocumentPdfService $pdf,
    ) {}

    public function index(OwnerStatementRequest $request): JsonResponse
    {
        return $this->json(['data' => $this->statementOf($request)]);
    }

    public function pdf(OwnerStatementRequest $request): Response
    {
        $statement = $this->statementOf($request);
        $agency = $request->agency();
        $title = __($statement['annual'] ? 'money_out.statement.annual_title' : 'money_out.statement.title');

        return $this->pdf->stream('pdf.statements.owner', [
            'title' => $title.' '.$statement['period'],
            'document_label' => $title,
            'agency' => $agency,
            'statement' => $statement,
        ], sprintf('releve-%s-%d.pdf', $statement['period'], $statement['landlord']['id']));
    }

    public function csv(OwnerStatementRequest $request): StreamedResponse
    {
        $statement = $this->statementOf($request);
        $name = sprintf('releve-%s-%d.csv', $statement['period'], $statement['landlord']['id']);

        return response()->streamDownload(function () use ($statement): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['type', 'reference', 'property_id', 'paid_at', 'amount', 'commission'], ';');
            foreach (['lease_payments', 'booking_payments'] as $set) {
                foreach ($statement['lines'][$set] as $line) {
                    fputcsv($out, [$set, $line['reference_number'], $line['property_id'], $line['paid_at'], $line['amount'], $line['commission']], ';');
                }
            }
            foreach ($statement['lines']['service_provider_bills'] as $line) {
                fputcsv($out, ['service_provider_bills', $line['reference_number'], $line['property_id'], '', -$line['amount'], ''], ';');
            }
            foreach ($statement['payouts'] as $payout) {
                fputcsv($out, ['payouts', $payout['reference_number'], '', $payout['processed_at'], $payout['net_amount'], ''], ';');
            }
            fputcsv($out, ['totals', '', '', '', $statement['totals']['net'], $statement['totals']['commission']], ';');
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** @return array<string, mixed> */
    private function statementOf(OwnerStatementRequest $request): array
    {
        return $this->statements->statement($request->agency(), $request->landlord(), $request->string('period')->toString());
    }
}
