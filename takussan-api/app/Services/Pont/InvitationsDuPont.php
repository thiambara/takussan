<?php

namespace App\Services\Pont;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\MessageRelay;
use App\Models\User;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Messaging\SystemMessageFactory;
use App\Services\Notifications\Sms\PhoneNumber;
use InvalidArgumentException;

/**
 * TCK-2981 (ADR-0132 § 3) — « Joindre par WhatsApp » un participant du fil.
 *
 * L'accord vaut pour le NUMÉRO, pas pour le fil : un numéro déjà `opted_in` par le pont (`pont_invitation`,
 * `pont_start`) pour CE compte, sur un canal du repli, est joint d'emblée, sans invitation ; un `opted_in` d'une autre
 * source (alerte de recherche) ne vaut pas accord ({@see CanalDuPont::compteAccordePour()}). Sinon l'invitation part
 * par l'ordre de repli, sur un canal qui porte un bouton de réponse (un SMS ne recueille pas d'accord).
 *
 * @return string|null un code d'erreur `pont.*`, ou null
 */
final class InvitationsDuPont
{
    public function __construct(
        private readonly RelaisSortant $relais,
        private readonly JointsParLePont $joints,
        private readonly SystemMessageFactory $avis,
    ) {}

    public function joindre(Conversation $fil, User $cible): ?string
    {
        $participant = $fil->participants()->where('users.id', $cible->id)->wherePivotNull('left_at')->exists();
        if (! $participant) {
            return 'pont.not_participant';
        }
        if ((string) $cible->phone === '') {
            return 'pont.no_phone';
        }
        try {
            $telephone = PhoneNumber::normalize((string) $cible->phone);
        } catch (InvalidArgumentException) {
            return 'pont.invalid_phone';
        }
        if ($this->relais->oppose($telephone)) {
            return 'pont.opted_out';
        }
        if ($this->joints->etat($fil, $cible->id) === JointsParLePont::JOINT) {
            return 'pont.already_joined';
        }
        $autre = User::query()->where('id', '!=', $cible->id)
            ->where(fn ($q) => $q
                ->where(fn ($w) => $w->where('phone', $telephone)->whereNotNull('phone_verified_at'))
                ->orWhere(fn ($w) => $w->where('secondary_phone', $telephone)->whereNotNull('secondary_phone_verified_at')))
            ->exists();
        if ($autre) {
            return 'pont.numero_deja_a_un_compte';
        }

        $agence = EquipeDuFil::agence($fil);
        $base = [
            'purpose' => MessageRelay::PURPOSE_INVITATION,
            'direction' => MessageRelay::DIRECTION_OUT,
            'conversation_id' => $fil->id,
            'agency_id' => $agence,
            'user_id' => $cible->id,
            'phone' => $telephone,
        ];

        // L'accord déjà donné au pont pour ce compte, sur un canal du repli : joint d'emblée.
        foreach ($this->relais->canaux() as $canal) {
            if ($canal->capacites()->recoit && $canal->accord($telephone) === EtatDAccord::Accorde && $canal->compteAccordePour($telephone) === $cible->id) {
                MessageRelay::query()->create($base + ['channel' => $canal->nom(), 'status' => MessageRelay::STATUS_ACCEPTE]);
                $this->avis->avisDuPont($fil, SystemMessageFactory::AVIS_PONT_ACCORD, ['user_id' => $cible->id, 'channel' => $canal->nom()]);

                return null;
            }
        }

        $invitation = MessageRelay::query()->create($base + ['status' => MessageRelay::STATUS_NON_ENVOYE]);
        $langue = $cible->preferredLocale() ?? (string) config('app.locale');
        $nomDAgence = $agence === null ? 'Takussan' : (string) (Agency::query()->whereKey($agence)->value('name') ?? 'Takussan');
        $sujet = (string) ($fil->subject ?? '');
        $texte = __('pont.invitation', ['agence' => $nomDAgence, 'sujet' => $sujet], $langue);
        $envoi = $this->relais->envoyer($telephone, $agence, $texte, 'pont_invitation', $langue, [$nomDAgence, $sujet], AccordDuPont::charge($invitation), exigeBoutons: true);
        if ($envoi !== null) {
            $this->relais->tracer($invitation, $envoi['canal'], $envoi['resultat']);
        }

        return null;
    }
}
