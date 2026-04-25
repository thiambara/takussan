<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-085 — Validates the body of `POST /api/conversations` when
 * `type = group`. Subject is required, participants must be unique
 * existing user ids, and the **total** count (creator + others) must be
 * 3..20.
 *
 * Authorization is unconditional (`true`) because access control is
 * handled by the route middleware (`auth:sanctum`) plus the controller's
 * scope checks. The FormRequest only enforces field-level shape.
 */
class CreateGroupConversationRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'subject' => ['required', 'string', 'max:255'],
            // The creator is auto-added — so 2 *other* participants is the
            // floor (3 total). We enforce both the size and integer-shape
            // here; the controller does the scope check.
            'participants' => ['required', 'array', 'min:2', 'max:19'],
            'participants.*' => ['required', 'integer', 'distinct', 'exists:users,id'],
            'property_id' => ['nullable', 'integer', 'exists:properties,id'],
            'lease_id' => ['nullable', 'integer', 'exists:leases,id'],
            'maintenance_request_id' => ['nullable', 'integer', 'exists:maintenance_requests,id'],
            'initial_message' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'subject.required' => __('messaging.errors.group_subject_required'),
            'participants.min' => __('messaging.errors.group_min_participants'),
            'participants.max' => __('messaging.errors.group_max_participants'),
        ];
    }
}
