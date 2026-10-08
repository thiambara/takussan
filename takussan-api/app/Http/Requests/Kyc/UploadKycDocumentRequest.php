<?php

namespace App\Http\Requests\Kyc;

use App\Support\Uploads\AcceptedUploads;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UploadKycDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'document_type' => ['required', 'string', Rule::in(['rccm', 'ninea', 'director_id'])],
            'document' => ['required', 'file', ...AcceptedUploads::kyc(10240)],
            // TCK-601 (C) — la pièce du dirigeant expire : son échéance est exigée, et à venir.
            'expires_at' => ['nullable', 'required_if:document_type,director_id', 'date_format:Y-m-d', 'after:today'],
        ];
    }
}
