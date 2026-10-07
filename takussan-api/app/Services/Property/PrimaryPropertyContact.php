<?php

namespace App\Services\Property;

use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;

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
 * Le personnel se juge par `PersonnelDeLAgence::estPersonnel()`, branché sur
 * `MembershipCapabilityResolver::isStaffAt()` depuis la fusion de TCK-587 : une seule définition,
 * au prix d'une requête par collaborateur `agent` examiné (l'ordre s'arrête au premier éligible).
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

        return self::agentPrincipal($property)?->user
            ?? (self::estProprietaire($owner, $property) || self::eligible($owner, $property) ? $owner : null);
    }

    /**
     * Vérification adverse (M7) — `property.user_id` est le CRÉATEUR du bien : son propriétaire
     * pour un particulier, mais, sur un bien d'agence, aussi bien l'agent qui l'a saisi —
     * `PropertyController::store` y pose l'appelant, `assignAgent` y met un agent. Lu tel quel
     * comme « propriétaire », il gardait à l'agent parti le repli du contact principal (son
     * numéro affiché au public, les demandes reçues), la boîte des demandes et le droit de
     * prévenir le visiteur.
     *
     * Il ne vaut donc propriétaire que joignable, et si le bien n'a pas d'agence, ou s'il détient
     * un profil propriétaire ACTIF dans l'agence du bien. Le personnel actif, lui, est jugé à
     * part, par {@see PersonnelDeLAgence::estPersonnel()}.
     */
    public static function estProprietaire(?User $user, Property $property): bool
    {
        return $user !== null
            && (int) $property->user_id === (int) $user->id
            && self::joignable($user)
            && ($property->agency_id === null || PersonnelDeLAgence::estBailleur($user, $property->agency_id));
    }

    /**
     * Les relations que tout appelant doit charger pour que {@see self::for()} soit juste ET
     * bon marché.
     *
     * `collaborators.user.media` et non `collaborators.user` : le contact principal porte un
     * avatar sur la carte de la fiche, et `getFirstMediaUrl()` sur une relation non chargée est
     * une requête de plus par appel.
     *
     * @return list<string>
     */
    public static function eagerLoads(): array
    {
        return [
            'owner',
            'collaborators.user.media',
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
        // L'ordre d'abord, l'éligibilité ensuite, et seulement jusqu'au premier éligible : depuis
        // TCK-587, juger le personnel est une requête (`isStaffAt`), et la fiche ne doit pas en
        // payer une par collaborateur.
        return $property->collaborators
            ->filter(fn (PropertyCollaborator $c) => $c->role === CollaboratorRole::Agent)
            ->sort(self::ordre(...))
            ->first(fn (PropertyCollaborator $c) => self::eligible($c->user, $property));
    }

    /**
     * Joignable et, pour un bien d'agence, personnel ACTIF de cette agence — la définition unique
     * de `PersonnelDeLAgence::estPersonnel()`.
     */
    private static function eligible(?User $user, Property $property): bool
    {
        if (! self::joignable($user)) {
            return false;
        }

        return $property->agency_id === null || PersonnelDeLAgence::estPersonnel($user, $property->agency_id);
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
