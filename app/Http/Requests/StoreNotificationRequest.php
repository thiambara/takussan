<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;

class StoreNotificationRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return Auth::check() && Auth::user()->hasPermissionTo('notifications.manage');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'user_id' => 'required|exists:users,id',
            'type' => 'required|string|max:50',
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'reference_id' => 'nullable|integer',
            'reference_type' => 'nullable|string|max:255',
            'is_read' => 'nullable|boolean',
            'read_at' => 'nullable|date',
            'is_actioned' => 'nullable|boolean',
            'actioned_at' => 'nullable|date',
            'delivered' => 'nullable|boolean',
            'delivery_channel' => 'nullable|string|in:app,email,sms,push',
            'delivered_at' => 'nullable|date',
        ];
    }
}
