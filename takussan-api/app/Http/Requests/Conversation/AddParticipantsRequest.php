<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use App\Rules\ParticipantIdsRule;
use App\Services\Messaging\MessagingReach;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * TCK-085 — `POST /conversations/{id}/participants` body validation.
 *
 * Beyond field-level shape we enforce two business rules:
 *  - **Cap** : the total active participant count after the add must
 *    stay ≤ 20.
 *  - **Scope** : every user_id must be reachable by the actor for THIS
 *    conversation, as defined by {@see MessagingReach} — which includes the
 *    team of the related property/lease agency (TCK-565 — the very rule the
 *    front's picker lists, through the same method).
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
            // TCK-565 — l'existence est vérifiée une fois pour tout le tableau (`withValidator()`),
            // plus par position : `exists` rendait « The selected user_ids.0 is invalid. ». Et
            // AUCUNE règle sur `user_ids.*` : `integer` ou `distinct` y produiraient la même forme.
            'user_ids' => ['bail', 'required', 'array', 'min:1', 'max:20', new ParticipantIdsRule(distinct: true)],
            'role' => ['nullable', Rule::enum(ParticipantRole::class)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            // TCK-565, passe finale — cette phrase était écrite en français en dur, pour les trois
            // langues (relevé du vérificateur, passe 3).
            'user_ids.required' => __('messaging.errors.participants_required'),
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
            if (empty($userIds) || $v->errors()->has('user_ids')) {
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

            // Scope check (TCK-565) : un candidat est accepté s'il est joignable par l'acteur POUR
            // CETTE conversation — la règle de `MessagingReach`, qui porte aussi « l'équipe de
            // l'agence du bien de la conversation ». C'est la même méthode, avec la même
            // conversation, qui alimente le sélecteur du front
            // (`GET /conversations/{conversation}/contacts`) : il ne propose donc personne que
            // cette garde refuse, et elle n'accepte personne qu'il ne montre pas.
            $actor = $this->user();
            $newIds = array_values(array_unique(array_diff(array_map('intval', $userIds), $alreadyIn)));

            if (User::query()->whereIn('id', $newIds)->count() !== count($newIds)) {
                $v->errors()->add('user_ids', __('messaging.errors.participants_unavailable'));

                return;
            }

            if (! $actor || app(MessagingReach::class)->outOfReach($actor, $newIds, $conversation) !== []) {
                $v->errors()->add('user_ids', __('messaging.errors.participants_out_of_reach'));
            }
        });
    }
}
