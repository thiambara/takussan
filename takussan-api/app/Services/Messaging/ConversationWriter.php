<?php

namespace App\Services\Messaging;

use App\Jobs\NotifyNewMessageJob;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Closure;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2782 — LE point d'écriture d'un message au nom d'un utilisateur, dans une conversation de l'API.
 *
 * Trois chemins écrivaient chacun le leur : l'envoi (`POST /api/conversations/{id}/messages`), le message
 * initial d'une directe (`POST /api/conversations`) et celui d'un groupe. Seul l'envoi jugeait
 * {@see ConversationAccess::allowsWriting()} ; les deux autres ne tenaient qu'aux gardes de création
 * (`GuardsConversationScope::guardContext()`, {@see MessagingReach}). Or une directe REPRISE par
 * {@see DirectConversationService::firstOrCreate()} n'est pas une création : c'est un envoi dans un fil
 * existant. Toute règle ajoutée à `allowsWriting` devait être recopiée dans les gardes de création, ou
 * elle était contournée — relevé du 2026-11-13 : un profil non actif autre que `blocked`/`inactive`
 * (le `draft`, que l'application ne rattache jamais à un compte) écrivait par le message initial
 * dans un fil où l'envoi lui rendait 403.
 *
 * Ici, l'écriture est jugée AVANT tout écrit, par la même règle que l'envoi : refusée, elle rend 403
 * avec le corps de `SendMessageConversationRequest` (`http.forbidden`), sans message ni notification.
 *
 * Hors de cette règle, chacun pour sa raison (garde `EcritureDeMessageUniqueTest`) :
 *  - le contact public d'une annonce (`PublicPropertyController::contactMessage()`) est la porte du
 *    visiteur, jugée par son propre formulaire ; un bailleur suspendu y écrit à sa propre annonce comme
 *    tout visiteur (décision y q2 du 2026-11-13) ;
 *  - un avis système ({@see SystemMessageFactory}) n'a pas d'auteur.
 */
class ConversationWriter
{
    public function __construct(private readonly ConversationAccess $access) {}

    /**
     * Écrit le message de `$author` dans `$conversation` : le message, le pointeur du fil, le marqueur de
     * lecture de l'auteur et le désarchivage, en une transaction ; puis `NotifyNewMessageJob`.
     *
     * Appelé dans une transaction ouverte (la directe ou le groupe créés dans la même requête), un refus
     * l'annule entière. La notification part dans une file `after_commit` (`config/queue.php`, TCK-1802) :
     * elle n'est jamais vue avant le COMMIT, ni du tout après une annulation.
     *
     * @param  array{content: string, type: string, metadata?: array<string, mixed>|null}  $attributes
     * @param  (Closure(Message): void)|null  $joindre  la pièce du message (note vocale, photo, PDF), rangée
     *                                                  dans la transaction, avant le pointeur du fil
     */
    public function post(User $author, Conversation $conversation, array $attributes, ?Closure $joindre = null): Message
    {
        abort_unless($this->access->allowsWriting($author, $conversation), 403);

        $message = DB::transaction(function () use ($author, $conversation, $attributes, $joindre) {
            $message = $conversation->messages()->create([
                'sender_id' => $author->id,
                'content' => $attributes['content'],
                'type' => $attributes['type'],
                'metadata' => $attributes['metadata'] ?? null,
            ]);

            if ($joindre !== null) {
                $joindre($message);
            }

            $conversation->update([
                'last_message_id' => $message->id,
                // TCK-2631 — l'aperçu d'une pièce est neutre (« Photo », « Document »), légende ou non.
                'last_message_preview' => mb_substr($message->neutralPreview() ?? $message->content, 0, 255),
                'last_message_at' => now(),
            ]);

            // L'auteur a lu son propre message, et le fil lui revient s'il l'avait archivé.
            $conversation->participants()->updateExistingPivot($author->id, [
                'last_read_at' => now(),
                'archived_at' => null,
            ]);

            // Un message entrant fait reparaître le fil dans la liste des autres participants.
            DB::table('conversation_participants')
                ->where('conversation_id', $conversation->id)
                ->where('user_id', '!=', $author->id)
                ->update(['archived_at' => null]);

            return $message;
        });

        NotifyNewMessageJob::dispatch($message->id);

        return $message;
    }
}
