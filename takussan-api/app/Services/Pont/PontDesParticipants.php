<?php

namespace App\Services\Pont;

use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Lease;
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

        // Tout se lit par lot : un nombre de requêtes qui ne dépend pas du nombre de participants.
        $autres = $participants->reject(fn (User $p) => (int) $p->id === (int) $lecteur->id);
        $telephones = $autres->mapWithKeys(fn (User $p) => [(int) $p->id => InvitationsDuPont::telephone($p)])->all();
        $numeros = array_values(array_unique(array_filter($telephones, fn (?string $t) => $t !== null)));
        $etats = $this->joints->etats($fil, array_keys($telephones));
        $etatsDesNumeros = $recepteur === null ? [] : $recepteur->etatsDesNumeros($numeros, $agence);
        $opposes = $recepteur === null ? [] : $this->relais->opposes($numeros);
        $portesAilleurs = $recepteur === null ? [] : InvitationsDuPont::numerosPortesAilleurs(array_filter($telephones, fn (?string $t) => $t !== null));

        $lignes = [];
        foreach ($autres as $participant) {
            $id = (int) $participant->id;
            $telephone = $telephones[$id];
            $etat = $etats[$id];
            $numero = $telephone === null || $recepteur === null ? new EtatDuNumero : $etatsDesNumeros[$telephone];
            $lignes[$id] = [
                'joint' => $etat === JointsParLePont::JOINT,
                'invitation_en_attente' => $etat === JointsParLePont::EN_ATTENTE,
                'canal' => $dernierCanal[$id] ?? null,
                'accord_at' => $numero->accord === EtatDAccord::Accorde ? $numero->accordLe : null,
                'opposition_at' => $numero->accord === EtatDAccord::Oppose ? $numero->oppositionLe : null,
                'fenetre_jusqu_a' => $numero->fenetreJusquA,
                'invitable' => $recepteur !== null && $telephone !== null && $etat !== JointsParLePont::JOINT
                    && $numero->accord !== EtatDAccord::Oppose && ! $opposes[$telephone]
                    && ! $portesAilleurs[$id],
            ];
        }

        return $lignes;
    }

    /**
     * TCK-2981 (ADR-0132 § 2) — la fiche du locataire SANS COMPTE du bail de cette salle, pour le bouton « Joindre »
     * (`POST …/pont/invitations {customer_id}`). `false` : le lecteur n'est pas du personnel actif (la clé est absente) ;
     * `null` : pas de bail, ou son locataire a un compte. Jamais un numéro.
     *
     * @return array{customer_id: int, full_name: string, invitable: bool, invitation_en_attente: bool, opposition_at: mixed}|false|null
     */
    public function fiche(User $lecteur, Conversation $fil, ?int $agence): array|false|null
    {
        if ($agence === null || ! EquipeDuFil::litLesNotes($lecteur, $fil, $agence)) {
            return false;
        }
        $bail = $fil->lease_id === null ? null : Lease::query()->find($fil->lease_id);
        $fiche = $bail?->tenant_id === null ? null : Customer::query()->find($bail->tenant_id);
        if ($fiche === null || $fiche->user_id !== null) {
            return null;
        }
        $recepteur = collect($this->relais->canaux())->first(fn (CanalDuPont $c) => $c->capacites()->recoit);
        $telephone = InvitationsDuPont::normaliser((string) $fiche->phone);
        $numero = $telephone === null || $recepteur === null ? new EtatDuNumero : $recepteur->etatDuNumero($telephone, $agence);
        $enAttente = MessageRelay::query()
            ->where('purpose', MessageRelay::PURPOSE_INVITATION)->where('conversation_id', $fil->id)->where('customer_id', $fiche->id)
            ->whereIn('status', [MessageRelay::STATUS_ENVOYE, MessageRelay::STATUS_REMIS, MessageRelay::STATUS_LU])
            ->exists();

        return [
            'customer_id' => (int) $fiche->id,
            'full_name' => (string) $fiche->full_name,
            'invitable' => $recepteur !== null && $telephone !== null && $numero->accord !== EtatDAccord::Oppose
                && ! $this->relais->oppose($telephone) && ! InvitationsDuPont::numeroPorteParUnCompte($telephone),
            'invitation_en_attente' => $enAttente,
            'opposition_at' => $numero->accord === EtatDAccord::Oppose ? $numero->oppositionLe : null,
        ];
    }
}
