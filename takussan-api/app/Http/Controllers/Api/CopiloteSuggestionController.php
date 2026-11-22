<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\DeciderUneSuggestionRequest;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\Conversation;
use App\Services\Ai\SuggestionRecorder;
use App\Services\Messaging\Copilote\GardeDuCopilote;
use App\Services\Messaging\Copilote\SortesDuCopilote;
use App\Support\ImpersonationContext;
use Illuminate\Http\JsonResponse;
use LogicException;

/**
 * TCK-2975 (ADR-0131 § 3) — la décision du lecteur sur une proposition du copilote : `accepted`, `edited` (avec
 * `final`, dont le différentiel est gardé) ou `rejected`, une seule fois.
 *
 * - Seul le DEMANDEUR (`ai_calls.actor_id`), encore servi par la garde de TCK-2974 sur le fil de la suggestion,
 *   décide. Tout autre cas — collègue, suggestion d'un autre usage, fil disparu, garde retirée — rend 404, sans
 *   dire que la suggestion existe.
 * - Une proposition purgée (`proposal = []`, 30 jours) ne se décide plus : 410.
 * - Rien n'est écrit dans le fil : le brouillon part par la route des messages, l'engagement par celle du lot 3.
 */
class CopiloteSuggestionController extends Controller
{
    public function decider(DeciderUneSuggestionRequest $request, int $suggestion, SuggestionRecorder $recorder, GardeDuCopilote $garde): JsonResponse
    {
        $user = $request->user();
        $ligne = AiSuggestion::query()->whereKey($suggestion)->whereIn('usage_key', SortesDuCopilote::usages())->first();
        $fil = $ligne !== null && $ligne->subject_type === (new Conversation)->getMorphClass()
            ? Conversation::query()->find($ligne->subject_id) : null;
        $demandeur = $ligne !== null ? AiCall::query()->whereKey($ligne->ai_call_id)->value('actor_id') : null;

        abort_code_unless(
            $fil !== null && (int) $demandeur === (int) $user->id
                && ! app(ImpersonationContext::class)->active() && $garde->autorise($user, $fil),
            404, 'copilote.suggestion_introuvable',
        );
        abort_code_unless($ligne->proposal !== [] && $ligne->proposal !== null, 410, 'copilote.suggestion_purgee');

        try {
            $decidee = match ($request->validated('decision')) {
                'accepted' => $recorder->accept($ligne, $user),
                'edited' => $recorder->edit($ligne, (array) $request->validated('final'), $user),
                'rejected' => $recorder->reject($ligne, $user),
            };
        } catch (LogicException $e) {
            abort_code_unless($e->getMessage() !== 'ai.suggestion_already_decided', 409, 'copilote.deja_decidee');
            throw $e;
        }

        return $this->json(['data' => ['id' => (int) $decidee->id, 'decision' => $decidee->decision?->value]]);
    }
}
