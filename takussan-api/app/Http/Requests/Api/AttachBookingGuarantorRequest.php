<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\BorneLesChampsDuGarant;
use App\Models\Enums\IdType;
use Illuminate\Validation\Rule;

/**
 * TCK-2893 (ADR-0110 § 3) — `POST /api/bookings/{booking}/guarantors` : un garant EXISTANT
 * (`guarantor_id`) ou une fiche neuve, créée à la volée — les champs de `StoreGuarantorRequest`,
 * mêmes bornes (`BorneLesChampsDuGarant`, ADR-0070 § 2). Les mêmes règles servent le garant
 * facultatif de la création (`StoreBookingRequest::guarantorRules`).
 */
class AttachBookingGuarantorRequest extends BaseFormRequest
{
    use BorneLesChampsDuGarant;

    /** Simple délégation : la règle vit dans `BookingPolicy::manageGuarantors`, jugée avant la validation. */
    public function authorize(): bool
    {
        return $this->user()?->can('manageGuarantors', $this->route('booking')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'guarantor_id' => ['nullable', 'integer', Rule::exists('guarantors', 'id')->withoutTrashed()],
        ] + self::fieldRules('required_without:guarantor_id');
    }

    /**
     * Les champs d'une fiche de garant neuve ; `$requis` pour le prénom et le nom.
     *
     * @return array<string, list<mixed>>
     */
    public static function fieldRules(string $requis): array
    {
        $rules = [
            'first_name' => [$requis, 'nullable', 'string'],
            'last_name' => [$requis, 'nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email', 'max:255'],
            'id_type' => ['nullable', Rule::enum(IdType::class)],
            'id_number' => ['nullable', 'string', 'max:100'],
            'occupation' => ['nullable', 'string'],
            'employer' => ['nullable', 'string'],
            'monthly_income' => ['nullable', 'numeric', 'min:0', 'max:999999999999.99'],
            'relationship_to_tenant' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ];
        foreach (self::BORNES_DU_GARANT as $cle => $longueur) {
            $rules[$cle][] = 'max:'.$longueur;
        }

        return $rules;
    }
}
