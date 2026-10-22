<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-597 (ADR-0043 §6) — signaler un avis public sans compte : un motif, et un champ piège.
 */
class ReportPublicReviewRequest extends BaseFormRequest
{
    /**
     * P145.02 (TCK-1285) — les codes de motif d'un avis, ceux que le front envoie
     * (`REVIEW_REPORT_REASONS`, `takussan-web/src/components/reports/ReviewReportButton.tsx`).
     * Un texte libre finissait tel quel dans `metadata.reports`.
     */
    public const REASONS = ['fraud', 'offensive', 'personal_data', 'conflict_of_interest', 'spam', 'off_topic', 'other'];

    /**
     * Route publique : pas d'autorisation à porter. `BaseFormRequest` refuse par défaut — sans
     * cette surcharge, l'endpoint rendrait 403 à tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', Rule::in(self::REASONS)],
            'company' => ['nullable', 'string', 'max:120'], // champ piège (cf. ContactLeadPublicRequest)
        ];
    }
}
