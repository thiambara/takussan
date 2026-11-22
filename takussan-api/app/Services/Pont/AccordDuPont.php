<?php

namespace App\Services\Pont;

use App\Jobs\EmettreLesLiensALaJonction;
use App\Jobs\RelayerMessageAuPont;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\UserStatus;
use App\Models\MessageRelay;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Messaging\SallesDuFil;
use App\Services\Messaging\SystemMessageFactory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * TCK-2981 (ADR-0132 § 3) — l'accord, lu par {@see PontEntrant} : la réponse au bouton « Accepter les messages » d'une
 * invitation, venue DU NUMÉRO INVITÉ et sur le canal de l'invitation, pose l'accord (`pont_invitation`, le compte
 * invité), marque l'invitation acceptée, écrit l'avis `pont.accord` (équipe seule) et vide la file d'attente d'accord
 * de ce destinataire, dans l'ordre.
 *
 * Une charge utile qui ne désigne pas une invitation de ce numéro sur ce canal n'est pas un accord (elle suit le
 * chemin d'un message).
 */
final class AccordDuPont
{
    public const PREFIXE = 'pont-invitation:';

    public function __construct(
        private readonly SystemMessageFactory $avis,
        // TCK-2981 — la fiche sans compte.
        private readonly PhoneVerificationService $verification,
        private readonly SallesDuFil $salles,
    ) {}

    public static function charge(MessageRelay $invitation): string
    {
        return self::PREFIXE.$invitation->id;
    }

    /** Vrai si le message était la réponse à une invitation (et l'accord est posé). */
    public function lire(CanalDuPont $canal, MessageEntrant $message): bool
    {
        $charge = (string) $message->reponseBouton;
        if (! str_starts_with($charge, self::PREFIXE) || ! ctype_digit(substr($charge, strlen(self::PREFIXE)))) {
            return false;
        }
        $invitation = MessageRelay::query()
            ->whereKey((int) substr($charge, strlen(self::PREFIXE)))
            ->where('purpose', MessageRelay::PURPOSE_INVITATION)
            ->where('direction', MessageRelay::DIRECTION_OUT)
            ->where('channel', $canal->nom())
            ->where('phone', $message->telephone)
            // TCK-2981 — l'invitation d'un compte, ou celle de la fiche sans compte d'un bail.
            ->where(fn ($q) => $q->whereNotNull('user_id')->orWhereNotNull('customer_id'))
            ->first();
        if ($invitation === null) {
            return false;
        }
        if ($canal->accord($message->telephone) === EtatDAccord::Oppose) {
            // STOP vaut jusqu'à START : le bouton d'une vieille invitation ne le lève pas.
            return true;
        }

        // TCK-2981 (ADR-0132 § 2) — la fiche sans compte : SEULE cette réponse crée son compte.
        if ($invitation->user_id === null && ! $this->compteDeLaFiche($canal, $invitation, $message->telephone)) {
            return true;
        }

        $canal->accorder($message->telephone, 'pont_invitation', (int) $invitation->user_id);
        $dejaAccepte = $invitation->status === MessageRelay::STATUS_ACCEPTE;
        $invitation->forceFill(['status' => MessageRelay::STATUS_ACCEPTE])->save();
        $fil = $invitation->conversation_id === null ? null : Conversation::query()->find($invitation->conversation_id);
        if ($fil !== null && ! $dejaAccepte) {
            $this->avis->avisDuPont($fil, SystemMessageFactory::AVIS_PONT_ACCORD, ['user_id' => (int) $invitation->user_id, 'channel' => $canal->nom()]);
            // TCK-2982 (ADR-0132 § 5) — les gestes que ce fil attend encore d'elle émettent leur lien.
            EmettreLesLiensALaJonction::dispatch((int) $fil->id, (int) $invitation->user_id)->afterCommit();
        }
        $this->viderLAttente((int) $invitation->user_id);

        return true;
    }

    /**
     * TCK-2981 (ADR-0132 § 2, décision du porteur du 2026-11-19) — la réponse au bouton de l'invitation envoyée à la
     * fiche, venue du numéro de la fiche : un compte sans mot de passe (`password_set_at` nul) au numéro de la fiche,
     * tenu pour vérifié par ce message, rattaché à la fiche, membre de la salle. Un numéro déjà porté par un compte
     * (principal ou second, vérifié ou non) bloque : rien n'est créé, l'accord n'est pas posé, avis au personnel,
     * AUCUNE fusion. Vrai si l'invitation porte désormais un compte.
     */
    private function compteDeLaFiche(CanalDuPont $canal, MessageRelay $invitation, string $telephone): bool
    {
        $fiche = Customer::query()->find($invitation->customer_id);
        $fil = $invitation->conversation_id === null ? null : Conversation::query()->find($invitation->conversation_id);
        if ($fiche === null || $fil === null || InvitationsDuPont::normaliser((string) $fiche->phone) !== $telephone) {
            return false;
        }
        if ($fiche->user_id === null) {
            if (InvitationsDuPont::numeroPorteParUnCompte($telephone)) {
                $this->avis->avisDuPont($fil, SystemMessageFactory::AVIS_PONT_NUMERO_DEJA_A_UN_COMPTE, ['channel' => $canal->nom()]);

                return false;
            }
            $compte = new User;
            $compte->forceFill([
                'first_name' => (string) ($fiche->first_name ?? ''),
                'last_name' => (string) ($fiche->last_name ?? ''),
                'email' => null,
                // Aucun mot de passe connu (TCK-272) : `password_set_at` reste nul.
                'password' => Hash::make(Str::random(40)),
                'status' => UserStatus::Active,
                'preferred_language' => config('app.locale'),
            ])->save();
            // Le seul écrivain de `phone_verified_at` : ce message vient de ce numéro.
            $this->verification->markVerified($compte, $telephone);
            $fiche->forceFill(['user_id' => $compte->id])->save();
        }
        $invitation->forceFill(['user_id' => (int) $fiche->user_id])->save();
        if (SallesDuFil::estUneSalle($fil)) {
            $this->salles->synchroniser($fil);
        }

        return true;
    }

    /** Les messages écrits avant l'accord partent, dans l'ordre (chacun repasse par la garde du job). */
    public function viderLAttente(int $userId): void
    {
        MessageRelay::query()
            ->where('user_id', $userId)
            ->where('direction', MessageRelay::DIRECTION_OUT)
            ->where('status', MessageRelay::STATUS_EN_ATTENTE_ACCORD)
            ->orderBy('id')
            ->get()
            ->each(function (MessageRelay $attente): void {
                $attente->forceFill(['status' => MessageRelay::STATUS_REPRIS])->save();
                RelayerMessageAuPont::dispatch((int) $attente->message_id, (int) $attente->user_id)->afterCommit();
            });
    }
}
