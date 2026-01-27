<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePropertyRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        $property = $this->route('property');
        return $this->user()->hasPermissionTo('properties.update') ||
            $this->user()->id === $property->user_id;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'parent_id' => 'nullable|exists:properties,id',
            'user_id' => 'nullable|exists:users,id',
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|string',
            'type' => 'sometimes|string|in:apartment,house,villa,land,office,store',
            'status' => 'sometimes|string|in:available,sold,rented,under_maintenance,unavailable',
            'visibility' => 'sometimes|string|in:public,private,unlisted',
            'price' => 'sometimes|numeric|min:0',
            'area' => 'sometimes|numeric|min:0',
            'position' => 'nullable|string',
            'level' => 'nullable|integer|min:0',
            'title_type' => 'nullable|string|in:freehold,leasehold,other',
            'with_administrative_monitoring' => 'nullable|boolean',
            'contract_type' => 'sometimes|string|in:sale,rent,lease',
            'servicing' => 'nullable|array',
            'servicing.*' => 'string',
            'metadata' => 'nullable|array',
            // 'metadata.construction_year' => 'nullable|string',
            // 'metadata.has_balcony' => 'nullable|boolean',
            // 'metadata.has_garden' => 'nullable|boolean',
            // 'metadata.has_pool' => 'nullable|boolean',
            // 'metadata.has_elevator' => 'nullable|boolean',
            // 'metadata.air_conditioning' => 'nullable|boolean',
            // 'metadata.parking_spaces' => 'nullable|integer|min:0',
            // 'metadata.heating_type' => 'nullable|string',
            // 'metadata.furnished_status' => 'nullable|string',
            // 'metadata.bedrooms' => 'nullable|integer|min:0',
            // 'metadata.bathrooms' => 'nullable|integer|min:0',
            // 'metadata.is_developed' => 'nullable|boolean',
            // 'metadata.has_water_connection' => 'nullable|boolean',
            // 'metadata.has_electricity_connection' => 'nullable|boolean',
            // 'metadata.has_sewage_connection' => 'nullable|boolean',
            // 'metadata.has_reception' => 'nullable|boolean',
            // 'metadata.has_kitchen' => 'nullable|boolean',
            // 'metadata.has_meeting_rooms' => 'nullable|boolean',
            // 'metadata.has_parking' => 'nullable|boolean',
            // 'metadata.has_security' => 'nullable|boolean',
            // 'metadata.has_storage' => 'nullable|boolean',
            // 'metadata.has_loading_dock' => 'nullable|boolean',

            // Address fields
            'address' => 'sometimes|array',
            'address.id' => 'nullable|exists:addresses,id',
            'address.address' => 'required_with:address|string',
            'address.street' => 'required_with:address|string',
            'address.city' => 'required_with:address|string',
            'address.state' => 'required_with:address|string',
            'address.postal_code' => 'nullable|string',
            'address.country' => 'required_with:address|string',
            'address.district' => 'nullable|string',
            'address.building' => 'nullable|string',
            'address.latitude' => 'nullable|string',
            'address.longitude' => 'nullable|string',

            // Tags
            'tags' => 'nullable|array',
            'tags.*' => 'exists:tags,id',

            // Media files
            'images' => 'nullable|array',
            'images.*' => 'file|image|max:10240',
            'documents' => 'nullable|array',
            'documents.*' => 'file|mimes:pdf,doc,docx,xls,xlsx|max:20480',
        ];
    }
}
