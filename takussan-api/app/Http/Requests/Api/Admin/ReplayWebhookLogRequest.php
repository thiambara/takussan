<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-602 (ADR-0051 §5) — rejouer une ligne du journal des webhooks. Le super-admin est déjà
 * exigé par le groupe `/api/admin/*` (`super-admin`), le second facteur frais par
 * `ProtectedActions::STEP_UP` ; le corps ne porte rien.
 */
class ReplayWebhookLogRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
