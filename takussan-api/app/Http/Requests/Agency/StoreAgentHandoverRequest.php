<?php

namespace App\Http\Requests\Agency;

use App\Models\Agency;
use App\Models\User;
use App\Services\Agency\AgentPortfolio;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * TCK-591 §8 — la passation : un repreneur unique (`successor_id`), ou un par catégorie
 * (`successors.{catégorie}`, qui l'emporte), `leave_unassigned` pour assumer ce qui reste, et
 * `remove_after` pour retirer le membre dans la même transaction.
 *
 * Un repreneur est du PERSONNEL de l'agence (agent ou admin), et n'est pas le partant : un bailleur
 * n'est jamais repreneur.
 */
class StoreAgentHandoverRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('removeMember', $this->route('agency'));
    }

    public function rules(): array
    {
        $categories = AgentPortfolio::TRANSFERABLE;

        return [
            'successor_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'successors' => ['nullable', 'array'],
            'successors.*' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'leave_unassigned' => ['sometimes', 'boolean'],
            'remove_after' => ['sometimes', 'boolean'],
        ] + collect($categories)->mapWithKeys(fn ($c) => ["successors.{$c}" => ['nullable', 'integer', Rule::exists('users', 'id')]])->all();
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            if ($v->errors()->isNotEmpty()) {
                return;
            }

            $unknown = array_diff(array_keys((array) $this->input('successors', [])), AgentPortfolio::TRANSFERABLE);
            foreach ($unknown as $category) {
                $v->errors()->add("successors.{$category}", __('validation.in', ['attribute' => $category]));
            }

            /** @var Agency $agency */
            $agency = $this->route('agency');
            $member = $this->route('user');
            foreach ($this->successorIds() as $field => $id) {
                $candidate = User::query()->find($id);
                // TCK-587 — prédicat « personnel de l'agence » ; `isStaffAt()` à sa fusion.
                $staff = $candidate !== null
                    && ($candidate->isAgentAt((int) $agency->id) || $candidate->isAgencyAdminAt((int) $agency->id));
                if (! $staff || (int) $id === (int) $member->id) {
                    $v->errors()->add($field, __('team_handover.handover.successor_not_staff'));
                }
            }

            if ($this->successorIds() === [] && ! $this->boolean('leave_unassigned')) {
                $v->errors()->add('successor_id', __('team_handover.handover.successor_required'));
            }
        });
    }

    /** @return array<string, int> champ → identifiant du repreneur */
    public function successorIds(): array
    {
        $ids = [];
        if ($this->filled('successor_id')) {
            $ids['successor_id'] = (int) $this->input('successor_id');
        }
        foreach ((array) $this->input('successors', []) as $category => $id) {
            if ($id !== null && $id !== '') {
                $ids["successors.{$category}"] = (int) $id;
            }
        }

        return $ids;
    }

    /** @return array<string, User> catégorie → repreneur */
    public function successorsByCategory(): array
    {
        $default = $this->filled('successor_id') ? User::query()->find((int) $this->input('successor_id')) : null;
        $byCategory = (array) $this->input('successors', []);

        $resolved = [];
        foreach (AgentPortfolio::TRANSFERABLE as $category) {
            $id = $byCategory[$category] ?? null;
            $user = ($id !== null && $id !== '') ? User::query()->find((int) $id) : $default;
            if ($user !== null) {
                $resolved[$category] = $user;
            }
        }

        return $resolved;
    }
}
