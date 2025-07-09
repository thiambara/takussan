<?php

namespace App\Http\Requests;

use DateTime;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;

class UpdateBookingRequest extends FormRequest
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
     * @return array<string, ValidationRule|array|string>
     */
    public function rules(): array
    {
        return [
            'property_id' => ['sometimes', 'exists:properties,id'],
            'customer_id' => ['sometimes', 'exists:customers,id'],
            'user_id' => ['nullable', 'exists:users,id'],
            'reference_number' => ['nullable', 'string', 'unique:bookings,reference_number,' . $this->booking->id],
            'status' => ['sometimes', 'string', 'in:pending,approved,rejected,cancelled,completed'],
            'booking_date' => ['sometimes', 'date'],
            'start_date' => ['sometimes', 'date'],
            'end_date' => ['sometimes', 'date', 'after_or_equal:start_date'],
            'expiration_date' => ['nullable', 'date'],
            'approval_date' => ['nullable', 'date'],
            'rejection_date' => ['nullable', 'date'],
            'cancellation_date' => ['nullable', 'date'],
            'completion_date' => ['nullable', 'date'],
            'price_at_booking' => ['sometimes', 'numeric', 'min:0'],
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

        // Calculate total_amount if start_date, end_date, or price_at_booking changes
        if (isset($data['price_at_booking']) || isset($data['start_date']) || isset($data['end_date'])) {
            // Get the latest values for these fields (either from request or from current model)
            $price = $data['price_at_booking'] ?? $this->booking->price_at_booking;
            $startDate = isset($data['start_date']) ? new DateTime($data['start_date']) : new DateTime($this->booking->start_date);
            $endDate = isset($data['end_date']) ? new DateTime($data['end_date']) : new DateTime($this->booking->end_date);

            // Calculate days and total amount
            $days = $endDate->diff($startDate)->days + 1; // Include both start and end days
            $data['total_amount'] = $price * $days;
        }

        return $data;
    }
}
