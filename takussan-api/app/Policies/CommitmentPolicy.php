<?php

namespace App\Policies;

use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\EquipeDuFil;
use WeakMap;

/**
 * TCK-2969 (ADR-0130 §§ 2 et 3) — qui lit un engagement, et qui y fait un geste.
 *
 *  - `view` : il se lit comme son fil (`ConversationAccess::allows` sur `conversation_id`). Le super-admin
 *    le lit comme il lit le fil ;
 *  - un GESTE (`confirm`, `cancel` ; TCK-2970 : `update`, `keep`, `reopen`, `notYet`, `remind`) : jamais le super-admin (ADR-0130 § 3), et toujours quelqu'un qui
 *    ÉCRIT dans le fil (`ConversationAccess::allowsWriting`). Ces méthodes jugent QUI ; l'état
 *    (`proposed`, `open`…) est jugé par la route, en 422 `commitment.invalid_state`.
 *
 * ⚠ À appeler DIRECTEMENT (`app(CommitmentPolicy::class)->confirm(…)`), jamais par `can()` : le
 * `Gate::before` du super-admin l'accepterait.
 */
class CommitmentPolicy
{
    public function view(User $user, Commitment $commitment): bool
    {
        $fil = $commitment->conversation;

        return $fil instanceof Conversation && app(ConversationAccess::class)->allows($user, $fil);
    }

    /** Confirmer : le seul porteur, qui écrit dans le fil. */
    public function confirm(User $user, Commitment $commitment): bool
    {
        return $this->peutAgir($user, $commitment)
            && (int) $commitment->holder_id === (int) $user->id;
    }

    /** Annuler : qui l'a noté, ou le personnel de l'agence de l'engagement qui lit le fil. */
    public function cancel(User $user, Commitment $commitment): bool
    {
        return $this->peutAgir($user, $commitment)
            && ((int) $commitment->created_by_id === (int) $user->id || self::estPersonnel($user, $commitment));
    }

    /** TCK-2970 — reporter (ou renommer) : le porteur, ou le personnel. */
    public function update(User $user, Commitment $commitment): bool
    {
        return $this->peutAgir($user, $commitment)
            && (self::estPorteur($user, $commitment) || self::estPersonnel($user, $commitment));
    }

    /** TCK-2970 (décision 2 « a + b ») — déclarer tenu : le porteur, le bénéficiaire, ou le personnel. */
    public function keep(User $user, Commitment $commitment): bool
    {
        return $this->peutAgir($user, $commitment)
            && (self::estPorteur($user, $commitment) || self::estBeneficiaire($user, $commitment) || self::estPersonnel($user, $commitment));
    }

    /**
     * TCK-2970 (ADR-0130 § 3) — rouvrir un engagement déclaré tenu : QUI, jamais combien de fois.
     *
     *  - le personnel, toujours (il tranche, même s'il est aussi une partie ou le déclarant) ;
     *  - sinon « l'autre partie » : le porteur ou le bénéficiaire qui n'a pas déclaré tenu (`kept_by_id`),
     *    et seulement si l'engagement a un bénéficiaire (pris envers l'agence : le personnel seul).
     *
     * Le droit UNIQUE et partagé des parties (`party_reopened_at`) est jugé par la route, sous verrou,
     * en 422 `commitment.already_reopened`.
     */
    public function reopen(User $user, Commitment $commitment): bool
    {
        if (! $this->peutAgir($user, $commitment)) {
            return false;
        }
        if (self::estPersonnel($user, $commitment)) {
            return true;
        }

        return $commitment->beneficiary_id !== null
            && (self::estPorteur($user, $commitment) || self::estBeneficiaire($user, $commitment))
            && (int) $commitment->kept_by_id !== (int) $user->id;
    }

    /** TCK-2970 — répondre « Pas encore » à la question « Tenu ? » : le seul bénéficiaire. */
    public function notYet(User $user, Commitment $commitment): bool
    {
        return $this->peutAgir($user, $commitment) && self::estBeneficiaire($user, $commitment);
    }

    /** TCK-2970 — relancer à la main : le seul personnel. */
    public function remind(User $user, Commitment $commitment): bool
    {
        return $this->peutAgir($user, $commitment) && self::estPersonnel($user, $commitment);
    }

    private static function estPorteur(User $user, Commitment $commitment): bool
    {
        return (int) $commitment->holder_id === (int) $user->id;
    }

    private static function estBeneficiaire(User $user, Commitment $commitment): bool
    {
        return $commitment->beneficiary_id !== null && (int) $commitment->beneficiary_id === (int) $user->id;
    }

    /**
     * Le personnel d'un engagement (ADR-0130 § 3) : le personnel actif de l'agence du FIL, sous son profil
     * ACTIF (`PersonnelDeLAgence::personnelActifDe` sur `EquipeDuFil::agence`), qui lit le fil — la règle
     * de la note d'équipe et de « Confier ».
     *
     * TCK-2970 — l'agence est la frontière d'isolation : `PersonnelDeLAgence::estPersonnel` jugeait la
     * personne sur TOUTES ses agences, si bien qu'un agent d'une autre agence, participant au fil (comme
     * bailleur, par exemple) mais personnel de celle du fil par un autre profil, y tranchait sous son profil
     * d'ailleurs.
     */
    public static function estPersonnel(User $user, Commitment $commitment): bool
    {
        $fil = $commitment->conversation;
        if (! $fil instanceof Conversation) {
            return false;
        }

        return PersonnelDeLAgence::personnelActifDe($user, self::agenceDuFil($fil))
            && app(ConversationAccess::class)->allows($user, $fil);
    }

    /**
     * TCK-2970 — l'agence du fil, une requête par instance de fil (`with('conversation')` partage
     * l'instance entre les engagements d'une liste) : une `WeakMap`, qui meurt avec l'instance.
     */
    private static function agenceDuFil(Conversation $fil): ?int
    {
        self::$agences ??= new WeakMap;
        if (! self::$agences->offsetExists($fil)) {
            self::$agences[$fil] = EquipeDuFil::agence($fil);
        }

        return self::$agences[$fil];
    }

    /** @var WeakMap<Conversation, int|null>|null */
    private static ?WeakMap $agences = null;

    private function peutAgir(User $user, Commitment $commitment): bool
    {
        $fil = $commitment->conversation;

        return ! $user->isSuperAdmin()
            && $fil instanceof Conversation
            && app(ConversationAccess::class)->allowsWriting($user, $fil);
    }
}
