<?php

namespace App\Http\Requests\ServiceProvider;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\CollaborationStatus;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Validation\Rule;

/**
 * TCK-592 — `PATCH /api/me/service-provider/collaborations/{collaboration} {status: ended}`.
 *
 * Le prestataire n'a qu'un geste sur sa collaboration : la finir. `paused` et `active` sont des
 * décisions de l'agence — les accepter ici lui permettrait de lever lui-même une pause.
 */
class EndServiceProviderCollaborationRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('endCollaboration', [ServiceProviderProfile::class, $this->route('collaboration')]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in([CollaborationStatus::Ended->value])],
        ];
    }
}
