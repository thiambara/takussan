<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\DocumentType;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de OwnerProfileController::uploadKyc(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UploadKycOwnerProfileRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * TCK-305 — la table vivait en `private const` sur le contrôleur, donc hors de portée
     * des règles une fois déplacées. Elle est ici, à l'endroit qui la valide ; le contrôleur
     * la relit depuis cette classe. *Une constante privée n'est pas une source partagée.*
     *
     * @var array<string, DocumentType>
     */
    public const KYC_KIND_TO_TYPE = [
        'cni' => DocumentType::IdCard,
        'rib' => DocumentType::Rib,
        'ninea' => DocumentType::Ninea,
    ];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // 8 MB max — phone captures (heic, webp), scans, PDFs.
            'file' => ['required', 'file', 'max:8192'],
            'kind' => ['required', 'string', Rule::in(array_keys(self::KYC_KIND_TO_TYPE))],
        ];
    }
}
