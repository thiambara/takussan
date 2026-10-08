<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PrivacyRequestChannel;
use App\Models\Enums\PrivacyRequestType;
use App\Models\PrivacyRequest;
use Illuminate\Validation\Rule;

/** TCK-601 (G) — une demande de droits reçue hors de l'application, saisie par le super-admin. */
class StorePrivacyRequestRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', PrivacyRequest::class) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::enum(PrivacyRequestType::class)],
            'channel' => ['required', Rule::enum(PrivacyRequestChannel::class)],
            'requester_name' => ['required', 'string', 'max:255'],
            'requester_contact' => ['nullable', 'string', 'max:255'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'received_at' => ['nullable', 'date', 'before_or_equal:today'],
        ];
    }
}
