<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\ConversationReportResource;
use App\Models\ConversationReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2859 (ADR-0114 § 2) — `GET /api/admin/conversation-reports` : la file des signalements de
 * conversation, du plus récent au plus ancien. Route de la console sans geste déclaré, donc au seul
 * `super_admin` (ADR-0047). Rend l'auteur, le motif, le commentaire et le fil (identifiant, type) ;
 * jamais le contenu des messages. Le traitement (décisions, écran) est hors périmètre.
 */
class ConversationReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $reports = ConversationReport::query()
            ->with(['reporter', 'conversation'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($this->tailleDePage($request, 25));

        return $this->paginated($reports, ConversationReportResource::collection($reports)->resolve($request));
    }
}
