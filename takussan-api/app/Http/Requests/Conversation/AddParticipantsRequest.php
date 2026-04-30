<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * TCK-085 — `POST /conversations/{id}/participants` body validation.
 *
 * Beyond field-level shape we enforce two business rules:
 *  - **Cap** : the total active participant count after the add must
 *    stay ≤ 20.
 *  - **Scope** : every user_id must either be in the same agency as the
 *    related property/lease, or share an existing relationship with the
 *    actor (agent ↔ customer relation, see UserCustomerRelationship).
 *
 * Permission to call this endpoint at all (admin-only) is decided by
 * `ConversationPolicy@addParticipant` — that's a *separate* gate and runs
 * before this request reaches `rules()`.
 */
class AddParticipantsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'user_ids' => ['required', 'array', 'min:1', 'max:20'],
            'user_ids.*' => ['required', 'integer', 'distinct', 'exists:users,id'],
            'role' => ['nullable', Rule::enum(ParticipantRole::class)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'user_ids.required' => 'Au moins un utilisateur doit être ajouté.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            /** @var Conversation $conversation */
            $conversation = $this->route('conversation');
            if (! $conversation instanceof Conversation) {
                return;
            }

            $userIds = (array) $this->input('user_ids', []);
            if (empty($userIds)) {
                return;
            }

            // Cap check: 20 max active participants after the add.
            $currentActive = $conversation->participants()
                ->wherePivotNull('left_at')
                ->count();

            $alreadyIn = $conversation->participants()
                ->whereIn('users.id', $userIds)
                ->wherePivotNull('left_at')
                ->pluck('users.id')
                ->all();
            $alreadyIn = array_map('intval', $alreadyIn);

            $netNew = count(array_diff(array_map('intval', $userIds), $alreadyIn));
            if ($currentActive + $netNew > 20) {
                $v->errors()->add('user_ids', __('messaging.errors.group_max_participants'));

                return;
            }

            // Scope check: every user must be agency-scoped to the related
            // property/lease, OR have an existing relationship with the
            // actor (agent ↔ customer mapped via UserCustomerRelationship,
            // or simply a shared past conversation).
            $actor = $this->user();
            $propertyAgencyId = null;
            if ($conversation->property_id) {
                $propertyAgencyId = $conversation->property?->agency_id;
            }
            if (! $propertyAgencyId && $conversation->lease_id) {
                $propertyAgencyId = $conversation->lease?->property?->agency_id;
            }

            foreach ($userIds as $uid) {
                if (in_array((int) $uid, $alreadyIn, true)) {
                    continue;
                }

                $candidate = User::find($uid);
                if (! $candidate) {
                    continue; // exists rule already caught it
                }

                if ($this->candidateInScope($actor, $candidate, $propertyAgencyId, $conversation)) {
                    continue;
                }

                $v->errors()->add(
                    'user_ids',
                    __('messaging.errors.participant_out_of_scope').' (#'.$candidate->id.')'
                );
            }
        });
    }

    protected function candidateInScope(?User $actor, User $candidate, ?int $propertyAgencyId, Conversation $conversation): bool
    {
        if ($actor && $actor->id === $candidate->id) {
            return true;
        }

        // Same agency as the related property/lease.
        if ($propertyAgencyId && $candidate->agency_id === $propertyAgencyId) {
            return true;
        }

        if (! $actor) {
            return false;
        }

        // Same agency as the actor (intra-agency invite).
        if ($actor->agency_id && $actor->agency_id === $candidate->agency_id) {
            return true;
        }

        // Existing pre-conversation relationship: actor and candidate
        // already share at least one previous conversation.
        $sharedConvCount = \DB::table('conversation_participants as cpa')
            ->join('conversation_participants as cpb', 'cpa.conversation_id', '=', 'cpb.conversation_id')
            ->where('cpa.user_id', $actor->id)
            ->where('cpb.user_id', $candidate->id)
            ->where('cpa.conversation_id', '!=', $conversation->id)
            ->count();

        if ($sharedConvCount > 0) {
            return true;
        }

        // Customer relationship — agent invites their customer or vice-versa.
        // Both directions: actor → customer linked to candidate, OR candidate → customer linked to actor.
        $linked = \DB::table('user_customer_relationships as ucra')
            ->join('user_customer_relationships as ucrb', 'ucra.customer_id', '=', 'ucrb.customer_id')
            ->where('ucra.user_id', $actor->id)
            ->where('ucrb.user_id', $candidate->id)
            ->exists();

        return $linked;
    }
}
