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
            // TCK-2669 (ADR-0104 § 2) — le numéro que porte une pièce RCCM ou NINEA, gardé sur elle ;
            // il n'écrase jamais `agencies.rccm`/`ninea`. Aucun contrôle de forme (dette D-68).
            'document_number' => ['nullable', 'string', 'max:50', 'prohibited_if:document_type,director_id'],
        ];
    }
}
