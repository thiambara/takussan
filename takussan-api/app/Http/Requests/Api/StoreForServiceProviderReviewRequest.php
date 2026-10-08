<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\MaintenanceRequest;
use App\Services\Review\ReviewEligibility;

/**
 * TCK-597 (ADR-0043 §3, AC9) — noter un prestataire, sur UNE intervention `completed`/`closed`
 * qui lui était assignée, par son demandeur ou le personnel de l'agence du bien. L'éligibilité
 * court dans `authorize()` (403 avant 422) : une intervention absente, ouverte ou assignée à un
 * autre est un refus, pas une erreur de forme.
 */
class StoreForServiceProviderReviewRequest extends BaseFormRequest
{
    private ?MaintenanceRequest $intervention = null;

    public function authorize(): bool
    {
        $author = $this->user();
        $provider = $this->route('serviceProviderProfile');
        $id = $this->input('maintenance_request_id');

        if ($author === null || $provider === null || ! is_numeric($id)) {
            return false;
        }

        $this->intervention = MaintenanceRequest::query()->find((int) $id);

        return app(ReviewEligibility::class)->forServiceProvider($author, $provider, $this->intervention);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'maintenance_request_id' => ['required', 'integer'],
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:5000'],
        ];
    }

    public function intervention(): MaintenanceRequest
    {
        return $this->intervention;
    }
}
