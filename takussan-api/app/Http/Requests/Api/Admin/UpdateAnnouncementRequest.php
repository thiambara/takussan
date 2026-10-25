<?php

namespace App\Http\Requests\Api\Admin;

use App\Models\Announcement;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateAnnouncementRequest extends StoreAnnouncementRequest
{
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'array'],
            'title.fr' => ['required_with:title', 'string', 'max:160'],
            'title.en' => ['required_with:title', 'string', 'max:160'],
            'title.wo' => ['required_with:title', 'string', 'max:160'],
            'body' => ['sometimes', 'array'],
            'body.fr' => ['required_with:body', 'string', 'max:4000'],
            'body.en' => ['required_with:body', 'string', 'max:4000'],
            'body.wo' => ['required_with:body', 'string', 'max:4000'],
            'severity' => ['sometimes', Rule::in(['info', 'success', 'warning', 'critical'])],
            'segment' => ['nullable', 'array'],
            'segment.roles' => ['nullable', 'array'],
            'segment.roles.*' => ['string', 'max:80'],
            'segment.agency_ids' => ['nullable', 'array'],
            'segment.agency_ids.*' => ['integer', Rule::exists('agencies', 'id')->withoutTrashed()],
            'segment.rollout_percentage' => ['nullable', 'integer', 'min:0', 'max:100'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * P209.04 (TCK-2069) — une date envoyée SEULE se juge contre l'autre date enregistrée :
     * `after:starts_at` ne compare à rien quand `starts_at` manque, et un `PATCH {ends_at}` avant
     * le début (ou `{starts_at}` après la fin) était enregistré — l'annonce ne s'affichait plus
     * jamais (`scopeCurrentlyVisible`). Les deux dates envoyées ensemble restent jugées par la
     * règle partagée avec la création ; une fin à `null` laisse le début libre.
     *
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $announcement = $this->route('announcement');
            $avecDebut = $this->has('starts_at');
            $avecFin = $this->has('ends_at');
            if (! $announcement instanceof Announcement || $avecDebut === $avecFin || $validator->errors()->hasAny(['starts_at', 'ends_at'])) {
                return;
            }

            $debut = $avecDebut ? $this->input('starts_at') : $announcement->starts_at;
            $fin = $avecFin ? $this->input('ends_at') : $announcement->ends_at;
            if ($debut === null || $fin === null || Carbon::parse($fin)->greaterThan(Carbon::parse($debut))) {
                return;
            }

            $avecFin
                ? $validator->errors()->add('ends_at', __('validation.after', ['attribute' => 'ends at', 'date' => Carbon::parse($debut)->toIso8601String()]))
                : $validator->errors()->add('starts_at', __('validation.before', ['attribute' => 'starts at', 'date' => Carbon::parse($fin)->toIso8601String()]));
        }];
    }
}
