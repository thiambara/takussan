<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Policies\PayoutPolicy;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-2909 — `GET /api/payouts/{payout}/notice/pdf` : l'avis de versement que l'agence remet au
 * bailleur — agence, bailleur, référence, nature, période, montants (XOF sans sous-unité,
 * `@currency`), moyen et destination MASQUÉE (ADR-0039 § 6), date du versement.
 *
 * Lu sous {@see PayoutPolicy::view()} : le bénéficiaire, l'émetteur encore membre, le personnel qui
 * tient `payouts.create`, le super-admin. Seul un reversement AU BAILLEUR et TERMINÉ a un avis : un
 * versement en attente, annulé ou échoué n'a rien versé, et pour une restitution au locataire
 * `landlord_id` ne désigne pas le bénéficiaire — 422 `payout.notice_unavailable`, après
 * l'autorisation (un tiers reçoit 403 sans rien apprendre).
 */
class PayoutNoticePdfController extends Controller
{
    public function __construct(private readonly DocumentPdfService $pdf) {}

    public function __invoke(Request $request, Payout $payout): Response
    {
        $this->authorize('view', $payout);
        abort_code_unless(
            $payout->payee_role === PayeeRole::Landlord && $payout->status === PayoutStatus::Completed,
            422,
            'payout.notice_unavailable'
        );

        $payout->loadMissing(['agency', 'payoutMethod:id,masked_identifier']);
        $landlord = User::withTrashed()->find($payout->landlord_id);
        // Comme le relevé (TCK-2315) : une société en tête, la personne en dessous.
        $company = OwnerProfile::companyNameOf($payout->landlord_id, $payout->agency_id);

        return $this->pdf->stream('pdf.payouts.notice', [
            'title' => __('money_out.notice.title').' '.$payout->reference_number,
            'document_label' => __('money_out.notice.title'),
            'agency' => $payout->agency,
            'payout' => $payout,
            'landlord' => $landlord,
            'company_name' => $company,
            'destination' => $payout->payoutMethod?->masked_identifier ?? ($payout->metadata['destination_masked'] ?? null),
        ], sprintf('avis-de-versement-%s.pdf', $payout->reference_number ?? $payout->id));
    }
}
