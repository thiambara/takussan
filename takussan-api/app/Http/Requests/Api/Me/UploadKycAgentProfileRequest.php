<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\AuthorizesTransitionally;
use App\Models\Enums\DocumentType;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de AgentProfileController::uploadKyc(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UploadKycAgentProfileRequest extends BaseFormRequest
{
    use AuthorizesTransitionally;

    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ **REPRISE, pas délégation** : cette règle n'est pas encore dans une policy — elle fait
     * partie des 19 helpers relevés hors périmètre de TCK-306. L'expression est reproduite à
     * l'identique ; son domicile définitif est une policy, et le ticket de suite doit la
     * convertir en délégation comme les 35 autres.
     */
    public function authorize(): bool
    {
        return $this->ownsProfile($this->route('agent_profile'));
    }

    /**
     * TCK-305 — la table vivait en `private const` sur le contrôleur, donc hors de portée
     * des règles une fois déplacées. Elle est ici, à l'endroit qui la valide ; le contrôleur
     * la relit depuis cette classe. *Une constante privée n'est pas une source partagée.*
     *
     * @var array<string, DocumentType>
     */
    public const KYC_KIND_TO_TYPE = [
        'license' => DocumentType::Other,
        'cni' => DocumentType::IdCard,
        'photo' => DocumentType::Photo,
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
