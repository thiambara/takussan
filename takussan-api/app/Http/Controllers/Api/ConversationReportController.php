<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\ReportConversationRequest;
use App\Http\Resources\ConversationReportResource;
use App\Models\Conversation;
use App\Models\ConversationReport;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2859 (ADR-0114 § 2) — `POST /conversations/{conversation}/reports` : un participant signale
 * le fil. Un seul signalement par auteur et par fil ; le second rend 409
 * `conversation.already_reported`. Rien n'est gelé, personne n'est prévenu.
 */
class ConversationReportController extends Controller
{
    public function store(ReportConversationRequest $request, Conversation $conversation): JsonResponse
    {
        $data = $request->validated();
        $now = now();

        // `insertOrIgnore` et non un `try/catch` sur la violation d'unicité : sous PostgreSQL, elle
        // abandonnerait la transaction entière (CLAUDE.md, pièges des migrations). Deux envois
        // simultanés : un seul s'écrit, l'autre lit 0 ligne et rend 409.
        $inserees = ConversationReport::query()->insertOrIgnore([
            'conversation_id' => $conversation->id,
            'reporter_id' => $request->user()->id,
            'reason' => $data['reason'],
            'comment' => $data['comment'] ?? null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        abort_code_if($inserees === 0, 409, 'conversation.already_reported');

        $report = ConversationReport::query()
            ->where('conversation_id', $conversation->id)
            ->where('reporter_id', $request->user()->id)
            ->firstOrFail();

        return $this->json([
            'data' => ConversationReportResource::make($report)->resolve($request),
        ], 201);
    }
}
