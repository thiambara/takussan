<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\BailleurDuBien;

/**
 * TCK-2748 (AC3) — **la relation de chaque participant actuel au CONTEXTE d'un fil**, pour un
 * lecteur déjà admis : `prestataire`, `locataire`, `proprietaire`, `agent`. Un code, jamais un
 * libellé (principe 5) ; le prestataire porte en plus la catégorie de l'intervention (`plumbing`…),
 * une donnée de l'intervention, pas de son profil.
 *
 * Dérivée, jamais stockée : le rôle stocké d'un participant (`admin`/`member`) reste celui du
 * GROUPE. À ne pas confondre avec {@see MessagingRelation} (TCK-2745), qui dit la relation d'une
 * personne avec l'APPELANT pour ranger « Nouvelle conversation ».
 *
 * ⚠️ **Chaque relation ne se lit que si le lecteur peut lire l'objet DONT ELLE VIENT** — même règle
 * que les blocs de {@see ConversationThreadContext} :
 *  - `locataire` — le titulaire d'un bail que le lecteur peut `view` (celui du fil, ou celui de
 *    l'intervention : deux objets, deux jugements) ;
 *  - `prestataire` — l'assigné d'une intervention que le lecteur peut `view` ;
 *  - `proprietaire` — le bailleur au sens de la policy ({@see BailleurDuBien}, jamais la colonne
 *    nue : l'agent qui a SAISI le bien n'est pas propriétaire), d'un bail lisible ou d'un bien que le
 *    lecteur peut `view`. PAS le bloc `property` du contexte : il est rendu à tout participant, et un
 *    prospect apprendrait qui possède le bien ;
 *  - `agent` — le personnel ACTIF (agent ou administrateur) de l'agence d'un objet lisible. Sans
 *    objet lisible, aucune agence : on ne retombe pas sur celle du lecteur.
 *
 * Une personne qui en cumule plusieurs reçoit la première de {@see self::ORDRE}.
 */
final class RelationsAuFil
{
    public const PRESTATAIRE = 'prestataire';

    public const LOCATAIRE = 'locataire';

    public const PROPRIETAIRE = 'proprietaire';

    public const AGENT = 'agent';

    public const ORDRE = [self::PRESTATAIRE, self::LOCATAIRE, self::PROPRIETAIRE, self::AGENT];

    /**
     * @param  Conversation  $conversation  `participants` déjà restreints aux membres actuels.
     * @return list<array{user_id: int, relation: string, category?: string|null}>
     */
    public static function pour(User $lecteur, Conversation $conversation, ?Lease $bailLisible, ?MaintenanceRequest $interventionLisible): array
    {
        $membres = $conversation->participants->map(fn (User $u) => (int) $u->id)->all();
        if ($membres === []) {
            return [];
        }

        /** @var array<int, array{relation: string, category?: string|null}> $trouves */
        $trouves = [];
        $poser = function (?int $userId, string $relation, array $extra = []) use (&$trouves, $membres): void {
            if ($userId === null || ! in_array($userId, $membres, true)) {
                return;
            }
            $actuelle = $trouves[$userId]['relation'] ?? null;
            if ($actuelle === null || array_search($relation, self::ORDRE, true) < array_search($actuelle, self::ORDRE, true)) {
                $trouves[$userId] = ['relation' => $relation, ...$extra];
            }
        };

        // Les baux lisibles : celui du fil (déjà jugé), et celui de l'intervention, jugé seul.
        $baux = [];
        if ($bailLisible !== null) {
            $baux[$bailLisible->id] = $bailLisible;
        }
        $bailDeLIntervention = $interventionLisible?->lease;
        if ($bailDeLIntervention !== null && ! isset($baux[$bailDeLIntervention->id]) && $lecteur->can('view', $bailDeLIntervention)) {
            $baux[$bailDeLIntervention->id] = $bailDeLIntervention;
        }

        // Les biens lisibles : celui du fil, du bail, de l'intervention — chacun par sa policy.
        $biens = [];
        foreach ([$conversation->property, $bailLisible?->property, $interventionLisible?->property] as $bien) {
            if ($bien instanceof Property && ! isset($biens[$bien->id]) && $lecteur->can('view', $bien)) {
                $biens[$bien->id] = $bien;
            }
        }

        $agences = [];

        if ($interventionLisible !== null) {
            $poser(
                $interventionLisible->assigned_to !== null ? (int) $interventionLisible->assigned_to : null,
                self::PRESTATAIRE,
                ['category' => $interventionLisible->category?->value],
            );
            if (($agence = $interventionLisible->property?->agency_id) !== null) {
                $agences[] = (int) $agence;
            }
        }

        foreach ($baux as $bail) {
            $tenantUserId = $bail->tenant?->user_id;
            $poser($tenantUserId !== null ? (int) $tenantUserId : null, self::LOCATAIRE);
            if ($bail->landlord_id !== null) {
                $bailleur = User::query()->find($bail->landlord_id);
                if ($bailleur !== null && BailleurDuBien::est($bailleur, $bail->landlord_id, $bail->agency_id)) {
                    $poser((int) $bailleur->id, self::PROPRIETAIRE);
                }
            }
            if ($bail->agency_id !== null) {
                $agences[] = (int) $bail->agency_id;
            }
        }

        foreach ($biens as $bien) {
            if ($bien->user_id !== null && in_array((int) $bien->user_id, $membres, true)) {
                $createur = User::query()->find($bien->user_id);
                if ($createur !== null && BailleurDuBien::est($createur, $bien->user_id, $bien->agency_id)) {
                    $poser((int) $createur->id, self::PROPRIETAIRE);
                }
            }
            if ($bien->agency_id !== null) {
                $agences[] = (int) $bien->agency_id;
            }
        }

        $agences = array_values(array_unique($agences));
        if ($agences !== []) {
            $personnel = array_unique(array_merge(
                AgentProfile::query()->active()->whereIn('agency_id', $agences)->whereIn('user_id', $membres)->pluck('user_id')->map(fn ($id) => (int) $id)->all(),
                AgencyAdminProfile::query()->active()->whereIn('agency_id', $agences)->whereIn('user_id', $membres)->pluck('user_id')->map(fn ($id) => (int) $id)->all(),
            ));
            foreach ($personnel as $id) {
                $poser($id, self::AGENT);
            }
        }

        $lignes = [];
        foreach ($membres as $id) {
            if (isset($trouves[$id])) {
                $lignes[] = ['user_id' => $id, ...$trouves[$id]];
            }
        }

        return $lignes;
    }
}
