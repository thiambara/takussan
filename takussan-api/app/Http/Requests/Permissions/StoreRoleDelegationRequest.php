<?php

namespace App\Http\Requests\Permissions;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreRoleDelegationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Fine-grained authorization handled by policy in controller
    }

    public function rules(): array
    {
        $maxDuration = config('role_delegations.max_duration_days', 366);
        $maxEndDate = now()->addDays($maxDuration)->toIso8601String();

        return [
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'role' => ['required', 'string', Rule::in(config('role_delegations.delegable_roles', []))],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at', "before_or_equal:$maxEndDate"],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $this->validateNotSelf($v);
            $this->validateBeneficiaryInAgency($v);
            $this->validateRoleNotPrimaryAdmin($v);
        });
    }

    private function validateNotSelf(Validator $validator): void
    {
        if ($this->user()->id === (int) $this->input('user_id')) {
            $validator->errors()->add('user_id', __('role_delegations.validation.self_delegation'));
        }
    }

    private function validateBeneficiaryInAgency(Validator $validator): void
    {
        $agency = $this->route('agency');
        $userId = $this->input('user_id');

        if (! $agency || ! $userId) {
            return;
        }

        $user = User::find($userId);
        if ($user && $user->agency_id !== $agency->id) {
            $validator->errors()->add('user_id', __('role_delegations.validation.user_not_in_agency'));
        }
    }

    private function validateRoleNotPrimaryAdmin(Validator $validator): void
    {
        $agency = $this->route('agency');
        $userId = $this->input('user_id');
        $role = $this->input('role');

        if (! $agency || ! $userId || $role !== 'agency_admin') {
            return;
        }

        if ($agency->primary_admin_id === (int) $userId) {
            $validator->errors()->add('role', __('role_delegations.validation.already_primary_admin'));
        }
    }

    public function messages(): array
    {
        return [
            'user_id.required' => __('validation.required', ['attribute' => 'utilisateur']),
            'role.required' => __('validation.required', ['attribute' => 'rôle']),
            'role.in' => __('role_delegations.validation.non_delegable_role'),
            'ends_at.required' => __('validation.required', ['attribute' => 'date de fin']),
            'ends_at.after' => __('validation.after', ['attribute' => 'date de fin', 'date' => 'date de début']),
            'ends_at.before_or_equal' => __('role_delegations.validation.max_duration'),
            'reason.max' => __('validation.max.string', ['attribute' => 'motif', 'max' => 500]),
        ];
    }
}
