<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Public\ReportPublicReviewRequest;
use App\Models\Review;
use App\Services\Review\ReviewReportService;
use App\Support\VisitorFingerprint;
use Illuminate\Http\JsonResponse;

/**
 * TCK-597 (ADR-0043 §6) — les gestes publics sur un avis.
 */
class PublicReviewController extends Controller
{
    /**
     * `POST /api/public/reviews/{review}/report` — sans compte. Seul un avis PUBLIÉ se signale
     * (404 sinon : un avis en attente n'existe pas pour le visiteur). Un jeton Bearer, s'il est
     * envoyé, rattache le signalement au compte. Un piège rempli rend 204 sans rien enregistrer.
     */
    public function report(ReportPublicReviewRequest $request, ReviewReportService $reports, Review $review): JsonResponse
    {
        $data = $request->validated();

        if (! empty($data['company'])) {
            return $this->json(null, 204);
        }

        // Seul un avis publié se signale : `ReviewReportService` le garde pour les deux routes.
        $reports->report($review, $request->user(), VisitorFingerprint::of($request), $data['reason']);

        return $this->json(['message' => __('messages.review_reported')]);
    }
}
