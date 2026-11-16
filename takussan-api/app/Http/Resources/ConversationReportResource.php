<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\ConversationReport;
use Illuminate\Http\Request;

/**
 * TCK-2859 (ADR-0114 § 2) — un signalement de conversation : à l'auteur qui vient de l'écrire, et au
 * super-admin dans la file de la console. Jamais le contenu des messages du fil.
 */
class ConversationReportResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var ConversationReport $report */
        $report = $this->resource;

        return [
            'id' => $report->id,
            'conversation_id' => $report->conversation_id,
            'reason' => $report->reason,
            'comment' => $report->comment,
            // TCK-815 — prénom et nom, puis `username`, puis « — » ; jamais l'e-mail.
            'reporter' => $this->whenLoaded('reporter', fn () => $report->reporter !== null
                ? ['id' => $report->reporter->id, 'name' => $report->reporter->nameWithoutContact()]
                : null),
            'conversation' => $this->whenLoaded('conversation', fn () => $report->conversation !== null
                ? ['id' => $report->conversation->id, 'type' => $this->enumValue($report->conversation->type)]
                : null),
            'created_at' => $this->iso($report->created_at),
        ];
    }
}
