<?php

namespace App\Http\Requests;

use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Services\Property\HierarchyService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-086 — body schema for `PATCH /api/properties/{property}`.
 *
 * Carries the same fields as the inline validate() that this request
 * replaces, plus the `parent_id` rules required to enforce
 * anti-cycle / max-depth / same-agency invariants.
 */
class UpdatePropertyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'type' => ['sometimes', Rule::enum(PropertyType::class)],
            'contract_type' => ['sometimes', Rule::enum(ContractType::class)],
            'rent_period' => ['sometimes', 'nullable', Rule::enum(RentPeriod::class)],
            'status' => ['sometimes', Rule::enum(PropertyStatus::class)],
            'visibility' => ['sometimes', Rule::enum(PropertyVisibility::class)],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'currency' => ['sometimes', Rule::enum(Currency::class)],
            'area' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'furnished' => ['sometimes', 'boolean'],
            'featured' => ['sometimes', 'boolean', Rule::prohibitedIf(! $this->user()->hasRole(['admin', 'super_admin']))],
            'available_from' => ['sometimes', 'nullable', 'date'],
            'parent_id' => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists('properties', 'id')->whereNull('deleted_at'),
                $this->parentIdRule(),
            ],
            'address' => ['sometimes', 'nullable', 'array'],
            'address.street' => ['sometimes', 'nullable', 'string'],
            'address.neighborhood' => ['sometimes', 'nullable', 'string'],
            'address.city' => ['sometimes', 'nullable', 'string'],
            'address.region' => ['sometimes', 'nullable', 'string'],
            'address.country' => ['sometimes', 'nullable', 'string', 'size:2'],
            'address.latitude' => ['sometimes', 'nullable', 'numeric'],
            'address.longitude' => ['sometimes', 'nullable', 'numeric'],
        ];
    }

    /**
     * Composite rule covering same-agency, anti-cycle and max-depth on the
     * `parent_id` payload key. Runs only when `parent_id` is non-null
     * (detaching to root is always allowed).
     */
    protected function parentIdRule(): ValidationRule
    {
        return new class($this->route('property')) implements ValidationRule
        {
            public function __construct(private readonly ?Property $node) {}

            public function validate(string $attribute, mixed $value, Closure $fail): void
            {
                if ($value === null || $value === '' || $this->node === null) {
                    return;
                }

                $candidate = Property::find($value);
                if ($candidate === null) {
                    return; // exists rule handles this case.
                }

                if ($candidate->agency_id !== $this->node->agency_id) {
                    $fail(__('messages.property_parent_same_agency_required'));

                    return;
                }

                $svc = app(HierarchyService::class);

                if ($svc->wouldCreateCycle($this->node, $candidate)) {
                    $fail(__('messages.property_parent_cycle_detected'));

                    return;
                }

                if ($svc->wouldExceedMaxDepth($this->node, $candidate)) {
                    $fail(__('messages.property_parent_max_depth_exceeded'));
                }
            }
        };
    }
}
