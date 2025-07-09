<?php

namespace App\Http\Requests;

use DateTime;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;

class StoreBookingRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'property_id' => ['required', 'exists:properties,id'],
            'customer_id' => ['required', 'exists:customers,id'],
            'user_id' => ['nullable', 'exists:users,id'],
            'reference_number' => ['nullable', 'string', 'unique:bookings,reference_number'],
            'status' => ['required', 'string', 'in:pending,approved,rejected,cancelled,completed'],
            'booking_date' => ['required', 'date'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'expiration_date' => ['nullable', 'date'],
            'approval_date' => ['nullable', 'date'],
            'rejection_date' => ['nullable', 'date'],
            'cancellation_date' => ['nullable', 'date'],
            'completion_date' => ['nullable', 'date'],
            'price_at_booking' => ['required', 'numeric', 'min:0'],
            'total_amount' => ['nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'deposit_paid' => ['nullable', 'boolean'],
            'deposit_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'reason_for_rejection' => ['nullable', 'string'],
            'reason_for_cancellation' => ['nullable', 'string'],
            'cancellation_by' => ['nullable', 'string'],
            'metadata' => ['nullable', 'array'],
        ];
    }

    /**
     * Get the validated data from the request.
     *
     */
    public function validationData(): array
    {
        $data = parent::validationData();

        // Set the user_id if not provided
        if (!isset($data['user_id']) && Auth::check()) {
            $data['user_id'] = Auth::id();
        }

        // Calculate total_amount based on price_at_booking and duration
        if (isset($data['price_at_booking']) && isset($data['start_date']) && isset($data['end_date'])) {
            $startDate = new DateTime($data['start_date']);
            $endDate = new DateTime($data['end_date']);
            $days = $endDate->diff($startDate)->days + 1; // Include both start and end days
            $data['total_amount'] = $data['price_at_booking'] * $days;
        }

        return $data;
    }
}
