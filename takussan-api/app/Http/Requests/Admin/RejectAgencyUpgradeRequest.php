<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-268 — payload validation for
 * `POST /api/admin/agency-upgrade-requests/{id}/reject`.
 *
 * `comment` is mandatory — the submitter sees the motif in the rejection
 * notification. The 5-character minimum keeps tooltip-tier "no" out of
 * the data and forces a meaningful reason.
 */
class RejectAgencyUpgradeRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'comment' => ['required', 'string', 'min:5', 'max:2000'],
        ];
    }
}
