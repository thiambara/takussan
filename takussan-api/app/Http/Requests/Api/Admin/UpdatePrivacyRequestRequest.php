<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PrivacyRequestStatus;
use App\Support\Uploads\AcceptedUploads;
use Illuminate\Validation\Rule;

/**
 * TCK-601 (G) — le suivi d'une demande : statut, résumé de la réponse, preuve (mêmes types de
 * fichier qu'une pièce KYC, partie B).
 */
class UpdatePrivacyRequestRequest extends BaseFormRequest
{
    public const PROOF_MAX_KB = 10240;

    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('privacyRequest')) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'status' => ['sometimes', Rule::enum(PrivacyRequestStatus::class)],
            'response_summary' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'proof' => ['sometimes', ...AcceptedUploads::kyc(self::PROOF_MAX_KB)],
        ];
    }
}
