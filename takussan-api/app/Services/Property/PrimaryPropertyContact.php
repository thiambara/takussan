<?php

namespace App\Services\Property;

use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;

/**
 * TCK-502 — **qui répond pour ce bien.** Une seule définition, pour tout le monde.
 *
 * Quatre surfaces désignaient une personne à propos d'un même bien, et elles ne désignaient pas
 * la même :
 *
 *   · la **carte de contact** de la fiche publique affichait `property.owner` — nom, avatar, lien ;
 *   · `GET /public/properties/{slug}/contact` rendait le téléphone de `property.owner` ;
 *   · le **message** authentifié, le **lead anonyme** et la **résolution** partaient au premier
 *     collaborateur de rôle `agent`, à défaut au propriétaire.
 *
 * Relevé le 2026-08-31 sur `terrain-viabilise-a-guediawaye-PVh69x` : la fiche montrait le visage
 * de Pape Cissé, le message arrivait chez Ousmane Ndiaye. **Aucun des deux chemins n'était faux
 * pris isolément** — c'est le genre d'écart qui ne se voit qu'en les regardant ensemble, et c'est
 * pourquoi la règle vit ici et nulle part ailleurs.
 *
 * ## La règle
 *
 * Le contact principal est le **collaborateur `agent` le plus anciennement invité**, à défaut le
 * propriétaire. Rien quand le bien n'a ni l'un ni l'autre.
 *
 * ## Pourquoi « le plus anciennement invité » et pas autre chose
 *
 * Le second défaut relevé par TCK-502 est que « l'agent principal » n'existait dans **aucune
 * colonne** : `firstWhere('role', Agent)` prenait celui que la collection rendait en tête,
 * c'est-à-dire l'ordre d'insertion — jamais décidé, jamais garanti, et différent d'une machine à
 * l'autre dès qu'un `ORDER BY` manque. Sur un bien à deux collaborateurs `agent`, le destinataire
 * du message était donc un tirage.
 *
 * ⚠️ **La règle « le plus ancien ACCEPTÉ », que le ticket suggérait, est inutilisable en l'état :
 * rien dans le code ne renseigne `accepted_at`.** `PropertyCollaboratorController::store()` ne
 * pose que `invited_at`, il n'existe aucun parcours d'acceptation, et seul le *seeder* remplit la
 * colonne. Adoptée telle quelle, elle aurait renvoyé au propriétaire **tout** collaborateur créé
 * par l'application — c'est-à-dire tous, en production. *Une règle qui n'est vraie que sur les
 * données de démonstration est une régression déguisée en rigueur.*
 *
 * `invited_at` + `id` est donc l'« ordre explicite » de la contrainte 1 du ticket : déterministe,
 * indépendant de l'ordre d'insertion, et sans colonne neuve à remplir.
 *
 * ## Qui est éligible (TCK-590)
 *
 * L'ordre ne dit pas tout : le premier de la liste peut ne plus être là. Un agent **bloqué**
 * (statut seul, rien n'est supprimé) ou **retiré de l'agence** (`AgentInvitationService::remove`
 * supprime son profil, jamais sa ligne de `property_collaborators`) restait destinataire — le lead
 * (nom, téléphone, message), la notification, le fil authentifié et le **numéro affiché aux
 * visiteurs** partaient chez quelqu'un hors de l'agence. Un collaborateur `agent` n'est donc
 * retenu que s'il est joignable (ni `blocked` ni `deleted`) et, pour un bien d'agence, PERSONNEL
 * de l'agence du bien ; le propriétaire, que s'il est joignable. L'ordre ne change pas.
 *
 * Le personnel se lit ici sur les profils CHARGÉS (cf. {@see self::eagerLoads()}) : un appel par
 * collaborateur serait une requête par ligne sur chaque fiche publique.
 */
class PrimaryPropertyContact
{
    /**
     * Le contact principal du bien, ou `null` s'il n'a ni collaborateur `agent` ni propriétaire.
     *
     * ⚠️ Suppose `owner` et `collaborators.user` chargés — cf. {@see self::eagerLoads()}. Sans
     * eux la méthode reste JUSTE mais devient une requête par collaborateur.
     */
    public static function for(Property $property): ?User
    {
        $owner = $property->owner;

        return self::agentPrincipal($property)?->user ?? (self::joignable($owner) ? $owner : null);
    }

    /**
     * Les relations que tout appelant doit charger pour que {@see self::for()} soit juste ET
     * bon marché.
     *
     * `collaborators.user.media` et non `collaborators.user` : le contact principal porte un
     * avatar sur la carte de la fiche, et `getFirstMediaUrl()` sur une relation non chargée est
     * une requête de plus par appel.
     *
     * TCK-590 — `agentProfiles` et `agencyAdminProfiles` : l'éligibilité juge le personnel de
     * l'agence sur eux, en mémoire.
     *
     * @return list<string>
     */
    public static function eagerLoads(): array
    {
        return [
            'owner',
            'collaborators.user.media',
            'collaborators.user.agentProfiles',
            'collaborators.user.agencyAdminProfiles',
        ];
    }

    /**
     * Un compte qui peut encore recevoir : ni bloqué, ni supprimé. Un compte supprimé en douceur
     * (`SoftDeletes`) n'arrive même pas jusqu'ici : la relation le rend nul.
     */
    public static function joignable(?User $user): bool
    {
        return $user !== null
            && ! in_array($user->status, [UserStatus::Blocked, UserStatus::Deleted], true);
    }

    private static function agentPrincipal(Property $property): ?PropertyCollaborator
    {
        return $property->collaborators
            ->filter(fn (PropertyCollaborator $c) => $c->role === CollaboratorRole::Agent && self::eligible($c->user, $property))
            ->sort(self::ordre(...))
            ->first();
    }

    /**
     * Joignable et, pour un bien d'agence, personnel ACTIF de cette agence (agent ou admin).
     *
     * TCK-587 — le prédicat « personnel » du dépôt est `MembershipCapabilityResolver::isStaffAt()`,
     * qui interroge la base ; il est relu ici sur les profils chargés pour ne pas ajouter une
     * requête par collaborateur. Les deux disent la même chose hors délégation de rôle — un
     * délégué n'est pas collaborateur d'un bien.
     */
    private static function eligible(?User $user, Property $property): bool
    {
        if (! self::joignable($user)) {
            return false;
        }

        $agencyId = $property->agency_id;
        if ($agencyId === null) {
            return true;
        }

        return $user->agentProfiles->contains(
            fn (AgentProfile $p) => (int) $p->agency_id === (int) $agencyId && $p->status === AgentProfileStatus::Active,
        ) || $user->agencyAdminProfiles->contains(
            fn (AgencyAdminProfile $p) => (int) $p->agency_id === (int) $agencyId && $p->status === AgencyAdminProfileStatus::Active,
        );
    }

    /**
     * `invited_at` croissant, **NULLS LAST**, puis `id` croissant.
     *
     * Les deux replis comptent. Sans le `NULLS LAST`, une ligne sans date d'invitation passerait
     * devant les autres et la règle redeviendrait un tirage sur les biens antérieurs à
     * `store()`. Sans le repli sur `id`, deux invitations de la même seconde — la colonne est un
     * `timestamp(0)` sous PostgreSQL — retomberaient sur l'ordre que la collection rend, qui est
     * exactement ce que ce ticket corrige.
     */
    private static function ordre(PropertyCollaborator $a, PropertyCollaborator $b): int
    {
        $da = $a->invited_at;
        $db = $b->invited_at;

        if ($da === null || $db === null) {
            if ($da === $db) {
                return $a->id <=> $b->id;
            }

            return $da === null ? 1 : -1;
        }

        return ($da <=> $db) ?: ($a->id <=> $b->id);
    }
}
