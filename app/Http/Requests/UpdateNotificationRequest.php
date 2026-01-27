<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;

class UpdateNotificationRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        $notification = $this->route('notification');

        // Allow users to update their own notifications (mainly for marking as read/actioned)
        // or administrators with the notification.manage permission
        return Auth::check() && (
                $notification->user_id === Auth::id() ||
                Auth::user()->hasPermissionTo('notifications.manage')
            );
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $rules = [
            'is_read' => 'nullable|boolean',
            'is_actioned' => 'nullable|boolean',
        ];

        // Only admins can update these fields
        if (Auth::user()->hasPermissionTo('notifications.manage')) {
            $rules = array_merge($rules, [
                'user_id' => 'nullable|exists:users,id',
                'type' => 'nullable|string|max:50',
                'title' => 'nullable|string|max:255',
                'content' => 'nullable|string',
                'reference_id' => 'nullable|integer',
                'reference_type' => 'nullable|string|max:255',
                'read_at' => 'nullable|date',
                'actioned_at' => 'nullable|date',
                'delivered' => 'nullable|boolean',
                'delivery_channel' => 'nullable|string|in:app,email,sms,push',
                'delivered_at' => 'nullable|date',
            ]);
        }

        return $rules;
    }
}
