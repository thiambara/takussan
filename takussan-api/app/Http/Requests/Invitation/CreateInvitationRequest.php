<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use App\Policies\InvitationPolicy;
use App\Services\Invitation\InvitationService;
use Illuminate\Validation\Rule;

/**
 * TCK-249 — payload validation for `POST /api/invitations`.
 *
 * Authorization is performed by the controller (which delegates to
 * {@see InvitationPolicy::create()}) — keeping the role/team
 * check outside the FormRequest so super_admin (with a null team context)
 * can short-circuit the same way it does for every other surface.
 */
class CreateInvitationRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        // The controller calls $this->authorize('create', Invitation::class)
        // explicitly, which yields the policy chain. Returning true here
        // simply opts out of the FormRequest-level gate so we don't
        // duplicate the policy logic.
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email:rfc'],
            // Whitelist the role values we actually issue invitations for.
            // Other roles exist (admin, customer, tenant) but are never
            // reached via the invitation flow — they're either
            // self-service or super-admin-only.
            'role' => ['required', 'string', Rule::in([
                'owner',
                'agent',
                'agency_admin',
                'service_provider',
                'super_admin',
            ])],
            // Polymorphic profile the invitation targets (pre-created in
            // `draft` by the per-role caller — TCK-256/258/260).
            //
            // TCK-455 — il n'est PLUS optionnel, sauf pour la cooptation
            // super-admin. Il l'était « pour la cooptation super-admin » —
            // un cas réel, jamais distingué des autres — et le résultat se
            // mesurait : `{email, role:'agent'}` sans `invitable_type` rendait
            // 201, l'acceptation 200, et le compte créé n'était membre de
            // rien. Le même relevé sur une agence `standard` a donné le même
            // résultat : le défaut n'avait rien à voir avec le type d'agence.
            //
            // Les valeurs recevables et le couple (rôle → type) viennent
            // d'{@see InvitationService} : la règle est celle du service, qui
            // la rejoue pour tous ses appelants internes. Ici elle n'est
            // rejouée que pour rendre une erreur de CHAMP au client plutôt
            // qu'un message global.
            'invitable_type' => [
                Rule::requiredIf(fn (): bool => ! in_array(
                    (string) $this->input('role'),
                    InvitationService::ROLES_WITHOUT_INVITABLE,
                    true,
                )),
                'nullable',
                'string',
                Rule::in(array_values(array_unique(InvitationService::INVITABLE_TYPE_BY_ROLE))),
            ],
            'invitable_id' => ['nullable', 'integer', 'required_with:invitable_type'],
            'agency_id' => ['nullable', 'integer', 'exists:agencies,id'],
            // Free-form per-flow payload (e.g. service zones, first lead
            // pre-assignment). Validation of the inner shape is delegated
            // to the per-role caller — this endpoint is generic.
            'metadata' => ['nullable', 'array'],
        ];
    }

    public function messages(): array
    {
        return [
            'role.in' => __('invitations.errors.invalid_role'),
            'invitable_type.required' => __('invitations.errors.invitable_required'),
            'invitable_type.in' => __('invitations.errors.invitable_unknown'),
        ];
    }
}
