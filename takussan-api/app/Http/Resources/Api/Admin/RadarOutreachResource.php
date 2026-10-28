<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-2388 (ADR-0077 §3, §4) — un message de démarchage pour la fiche annonceur. Il rend le texte ENREGISTRÉ
 * (`message`) : aucune lecture ne régénère quoi que ce soit. `status` : `prepared` (jamais envoyé), `sent`,
 * `closed` (issue finale ; `question` et `no_answer` restent `sent` : une réponse déposée plus tard peut encore les
 * changer). `follow_up` n'est posé que par {@see self::withFollowUp()}, pour un message de la file « à relancer ».
 *
 * `segments` et `wa_me_url` viennent du composeur (`ConsentMessageComposer`, tâche 3 du ticket) : tant qu'il n'est pas
 * là, ils rendent `[]` et `null`.
 */
class RadarOutreachResource extends BaseResource
{
    /** @var array{due_at: string|null, propose_no_answer: bool}|null */
    private ?array $followUp = null;

    /** @param  array{due_at: string|null, propose_no_answer: bool}|null  $followUp */
    public function withFollowUp(?array $followUp): static
    {
        $this->followUp = $followUp;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'locale' => $this->locale,
            'clauses_version' => $this->clauses_version,
            'status' => $this->status(),
            'listing_ids' => $this->listings->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all(),
            'salutation' => $this->salutation,
            'summary' => $this->summary,
            'message' => $this->message,
            'segments' => [],
            'wa_me_url' => null,
            'follow_up_of_id' => $this->follow_up_of_id,
            'follow_up_rank' => $this->follow_up_rank,
            'created_by' => $this->creator === null ? null : [
                'id' => $this->creator->id,
                'name' => $this->creator->nameWithoutContact(),
            ],
            'created_at' => $this->iso($this->created_at),
            'sent_at' => $this->iso($this->sent_at),
            'outcome' => $this->enumValue($this->outcome),
            'outcome_at' => $this->iso($this->outcome_at),
            'follow_up' => $this->followUp,
            'consents' => RadarConsentResource::collection($this->consents)->toArray($request),
        ];
    }

    private function status(): string
    {
        return match (true) {
            ! $this->isSent() => 'prepared',
            $this->outcome?->isFinal() === true => 'closed',
            default => 'sent',
        };
    }
}
