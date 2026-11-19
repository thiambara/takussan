<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\AssignConversationRequest;
use App\Http\Requests\Conversation\GesteDeLaBoiteRequest;
use App\Http\Requests\Conversation\SnoozeConversationRequest;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationType;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Messaging\FileDuFil;
use App\Services\Messaging\SallesDuFil;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\TempsReel;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/**
 * TCK-2967 (ADR-0128 § 7) — les trois gestes de la boîte de pilotage. La FILE d'un fil ne se stocke pas
 * ({@see FileDuFil}) ; seuls ces gestes s'écrivent :
 *
 *  - « Rappelez-le-moi » (`PUT|DELETE …/snooze`) et « Traité » (`PUT|DELETE …/handled`) : sur la ligne de
 *    participation du LECTEUR, propres à lui ; `boite.updated` part vers lui seul ;
 *  - confier le fil (`PUT …/assignee`) : une salle ou un groupe seulement — jamais le fil d'un prospect, qui
 *    suit le contact principal du bien (ADR-0068) —, par et à du personnel actif de l'agence du fil qui y
 *    participe ; `boite.updated` part vers le personnel participant.
 *
 * Aucun signal sur le canal du sujet : la file d'un lecteur ne regarde que lui. L'autorisation (participant
 * actif, lecture permise) est jugée par {@see GesteDeLaBoiteRequest}, avant la validation ; une session
 * d'impersonation est refusée avant même, par `EnforceImpersonationReadOnly` (aucune écriture).
 */
class ConversationPilotageController extends Controller
{
    public function snooze(SnoozeConversationRequest $request, Conversation $conversation): JsonResponse
    {
        $jusqua = Carbon::parse($request->validated('until'))->utc();
        $this->ecrireMaLigne($request, $conversation, ['snoozed_until' => $jusqua]);

        return $this->json(['data' => [
            'conversation_id' => $conversation->id,
            'snoozed_until' => $this->instant($jusqua),
        ]]);
    }

    public function unsnooze(GesteDeLaBoiteRequest $request, Conversation $conversation): JsonResponse
    {
        $this->ecrireMaLigne($request, $conversation, ['snoozed_until' => null]);

        return $this->json(['data' => ['conversation_id' => $conversation->id, 'snoozed_until' => null]]);
    }

    /** « Traité » : le fil quitte « À vous » jusqu'au prochain message compté ou événement attendu. */
    public function handle(GesteDeLaBoiteRequest $request, Conversation $conversation): JsonResponse
    {
        $maintenant = now();
        $this->ecrireMaLigne($request, $conversation, ['handled_at' => $maintenant]);

        return $this->json(['data' => [
            'conversation_id' => $conversation->id,
            'handled_at' => $this->instant($maintenant),
        ]]);
    }

    /** L'« Annuler » du toast de « Traité ». */
    public function unhandle(GesteDeLaBoiteRequest $request, Conversation $conversation): JsonResponse
    {
        $this->ecrireMaLigne($request, $conversation, ['handled_at' => null]);

        return $this->json(['data' => ['conversation_id' => $conversation->id, 'handled_at' => null]]);
    }

    public function assign(AssignConversationRequest $request, Conversation $conversation): JsonResponse
    {
        abort_code_unless(
            $conversation->type === ConversationType::Group || SallesDuFil::estUneSalle($conversation),
            422,
            'messaging.assignee_thread_type',
        );

        $agence = EquipeDuFil::agence($conversation);
        abort_code_unless(PersonnelDeLAgence::personnelActifDe($request->user(), $agence), 422, 'messaging.assignee_author_not_staff');

        $cibleId = $request->validated('user_id');
        $cible = $cibleId === null ? null : User::query()->find((int) $cibleId);
        abort_code_if(
            $cibleId !== null && ! (
                PersonnelDeLAgence::estPersonnel($cible, $agence)
                && ConversationParticipant::query()
                    ->where('conversation_id', $conversation->id)
                    ->where('user_id', (int) $cibleId)
                    ->whereNull('left_at')
                    ->exists()
            ),
            422,
            'messaging.assignee_not_staff',
        );

        $conversation->forceFill(['assigned_to_id' => $cible?->id])->save();

        // Le personnel participant : ceux dont la file change (« À vous » ↔ « En attente »).
        TempsReel::signalerA(EquipeDuFil::idsDesLecteursDesNotes((int) $conversation->id), CodeDeSignal::BoiteUpdated, $conversation);

        return $this->json(['data' => [
            'conversation_id' => $conversation->id,
            'assigned_to' => $cible === null ? null : ['id' => (int) $cible->id, 'name' => $cible->nameWithoutContact()],
        ]]);
    }

    /**
     * Écrit sur la seule ligne de participation du lecteur, par le pivot (`updateExistingPivot`), puis
     * signale `boite.updated` à lui seul.
     *
     * @param  array<string, mixed>  $valeurs
     */
    private function ecrireMaLigne(GesteDeLaBoiteRequest $request, Conversation $conversation, array $valeurs): void
    {
        $user = $request->user();
        $conversation->participants()->updateExistingPivot($user->id, $valeurs);
        TempsReel::signalerA($user, CodeDeSignal::BoiteUpdated, $conversation);
    }
}
