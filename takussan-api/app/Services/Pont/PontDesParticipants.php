<?php

namespace App\Services\Pont;

use App\Models\Conversation;
use App\Models\MessageRelay;
use App\Models\User;
use App\Services\Messaging\EquipeDuFil;
use Illuminate\Support\Collection;

/**
 * TCK-2981 (ADR-0132 § 3) — le bloc `pont` de `GET /api/conversations/{id}/context`, par participant actif (le
 * lecteur exclu), au SEUL personnel actif de l'agence du fil : `null` pour tout autre lecteur (la clé est alors
 * absente). Jamais un numéro : seulement ce que l'écran de l'agent affiche (joint, invitation en attente, canal,
 * dates d'accord et d'opposition, fin de fenêtre, « Joindre » possible).
 */
final class PontDesParticipants
{
    public function __construct(
        private readonly RelaisSortant $relais,
        private readonly JointsParLePont $joints,
    ) {}

    /**
     * @param  Collection<int, User>  $participants  les participants actifs
     * @return array<int, array{joint: bool, invitation_en_attente: bool, canal: ?string, accord_at: mixed, opposition_at: mixed, fenetre_jusqu_a: mixed, invitable: bool}>|null
     */
    public function pour(User $lecteur, Conversation $fil, ?int $agence, Collection $participants): ?array
    {
        if ($agence === null || ! EquipeDuFil::litLesNotes($lecteur, $fil, $agence)) {
            return null;
        }
        $recepteur = collect($this->relais->canaux())->first(fn (CanalDuPont $c) => $c->capacites()->recoit);
        $dernierCanal = MessageRelay::query()
            ->where('conversation_id', $fil->id)->where('direction', MessageRelay::DIRECTION_OUT)->whereNotNull('channel')
            ->orderBy('id')->pluck('channel', 'user_id')->all();

        $lignes = [];
        foreach ($participants as $participant) {
            if ((int) $participant->id === (int) $lecteur->id) {
                continue;
            }
            $telephone = InvitationsDuPont::telephone($participant);
            $etat = $this->joints->etat($fil, (int) $participant->id);
            $numero = $telephone === null || $recepteur === null ? new EtatDuNumero : $recepteur->etatDuNumero($telephone, $agence);
            $lignes[(int) $participant->id] = [
                'joint' => $etat === JointsParLePont::JOINT,
                'invitation_en_attente' => $etat === JointsParLePont::EN_ATTENTE,
                'canal' => $dernierCanal[(int) $participant->id] ?? null,
                'accord_at' => $numero->accord === EtatDAccord::Accorde ? $numero->accordLe : null,
                'opposition_at' => $numero->accord === EtatDAccord::Oppose ? $numero->oppositionLe : null,
                'fenetre_jusqu_a' => $numero->fenetreJusquA,
                'invitable' => $recepteur !== null && $telephone !== null && $etat !== JointsParLePont::JOINT
                    && $numero->accord !== EtatDAccord::Oppose && ! $this->relais->oppose($telephone)
                    && ! InvitationsDuPont::numeroPorteAilleurs($telephone, (int) $participant->id),
            ];
        }

        return $lignes;
    }
}
