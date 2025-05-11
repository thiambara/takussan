<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePropertyRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        $property = $this->route('property');
        return $this->user()->hasPermission('properties.update') || 
               $this->user()->id === $property->user_id;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
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
            
            // Address fields
            'address' => 'sometimes|array',
            'address.street' => 'required_with:address|string',
            'address.city' => 'required_with:address|string',
            'address.state' => 'required_with:address|string',
            'address.postal_code' => 'required_with:address|string',
            'address.country' => 'required_with:address|string',
            
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
