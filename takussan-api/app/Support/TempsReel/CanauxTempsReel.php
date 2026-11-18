<?php

namespace App\Support\TempsReel;

use App\Models\Conversation;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use App\Support\ImpersonationContext;
use Closure;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * TCK-2952 (ADR-0129 § 2) — le registre FERMÉ des canaux temps réel.
 *
 * Chaque `type` est associé à un modèle et à une fermeture qui juge la LECTURE pour un `User`. Rendre un objet
 * « en direct », c'est une ligne ici, et des appels à {@see TempsReel}. `routes/channels.php` cherche le type
 * venu du client dans ce tableau AVANT toute résolution : aucun nom venu du client n'est jamais appelé comme
 * méthode ni comme classe, et un type inconnu est refusé.
 *
 * Le lot 0 n'inscrit que `conversation`. Les autres types (bail, intervention, paiement…) arrivent avec leurs
 * lots, une ligne chacun — et `tests/Feature/TempsReel/AutorisationDesCanauxTest` rougit tant qu'un type
 * inscrit n'a pas sa paire lecteur / non-lecteur.
 */
final class CanauxTempsReel
{
    /** Le type des canaux personnels, `utilisateur.{id}` — hors registre : il ne désigne aucun modèle. */
    public const UTILISATEUR = 'utilisateur';

    /** Un identifiant de canal : un entier positif, borné pour ne jamais déborder un `bigint` (2^63 a 19 chiffres). */
    private const IDENTIFIANT = '/\A[1-9][0-9]{0,17}\z/';

    /**
     * @return array<string, array{modele: class-string<Model>, lecture: Closure(User, Model): bool}>
     */
    public static function types(): array
    {
        return [
            'conversation' => [
                'modele' => Conversation::class,
                'lecture' => fn (User $user, Conversation $conversation): bool => app(ConversationAccess::class)->allows($user, $conversation),
            ],
        ];
    }

    /** Le type d'un modèle inscrit ; une faute de programmation pour tout autre. */
    public static function typeDe(Model $modele): string
    {
        foreach (self::types() as $type => $entree) {
            if ($modele::class === $entree['modele']) {
                return $type;
            }
        }

        throw new LogicException(sprintf('%s n\'est pas inscrit au registre des canaux temps réel (ADR-0129 § 2).', $modele::class));
    }

    /** Le canal d'un objet, sans préfixe : `sujet.conversation.42`. */
    public static function canalDuSujet(Model $modele): string
    {
        return 'sujet.'.self::typeDe($modele).'.'.$modele->getKey();
    }

    /** La valeur de `subject` d'un objet : `conversation:42`. */
    public static function sujetDe(Model $modele): string
    {
        return self::typeDe($modele).':'.$modele->getKey();
    }

    /** Le canal personnel d'une personne, sans préfixe : `utilisateur.7`. */
    public static function canalDe(int $utilisateurId): string
    {
        return self::UTILISATEUR.'.'.$utilisateurId;
    }

    /**
     * L'autorisation de `sujet.{type}.{id}`. Ordre : impersonation, puis le type cherché dans le registre, puis
     * la forme de l'identifiant, et seulement alors la résolution du modèle et sa règle de lecture.
     *
     * @return array{id: int}|false la présence ne publie que l'identifiant : ni nom, ni avatar
     */
    public static function autoriserSujet(User $user, string $type, string $id): array|false
    {
        if (self::sousImpersonation()) {
            return false;
        }
        $types = self::types();
        if (! array_key_exists($type, $types) || preg_match(self::IDENTIFIANT, $id) !== 1) {
            return false;
        }

        $modele = $types[$type]['modele']::query()->find((int) $id);
        if (! $modele instanceof Model) {
            return false;
        }

        return ($types[$type]['lecture'])($user, $modele) === true ? ['id' => (int) $user->id] : false;
    }

    /**
     * L'autorisation de `utilisateur.{id}` : soi-même, et personne d'autre.
     *
     * @return array{id: int}|false
     */
    public static function autoriserUtilisateur(User $user, string $id): array|false
    {
        if (self::sousImpersonation()) {
            return false;
        }

        return preg_match(self::IDENTIFIANT, $id) === 1 && (int) $id === (int) $user->id ? ['id' => (int) $user->id] : false;
    }

    /**
     * ADR-0129 § 4 — aucune autorisation de canal pendant une impersonation, quel que soit le verbe :
     * `Broadcast::routes()` répond aussi en `GET`, que `EnforceImpersonationReadOnly` laisse passer.
     */
    private static function sousImpersonation(): bool
    {
        return app(ImpersonationContext::class)->active();
    }
}
