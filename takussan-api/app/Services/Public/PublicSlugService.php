<?php

namespace App\Services\Public;

use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\User;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

/**
 * TCK-2519 — le slug public d'une fiche `/agents/{slug}`, dérivé du nom affiché : `sokhna-gueye`,
 * et non plus le `username` technique (`dakar-immo-owner-4`). Le SEUL endroit qui le calcule.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE LE SLUG DIT, ET CE QU'IL NE DIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * · Un AGENT en exercice : prénom et nom, translittérés (`Sokhna Guèye` → `sokhna-gueye`).
 * · Un PROPRIÉTAIRE : prénom et INITIALE du nom (`Awa Diop` → `awa-d`). Sa fiche montre un nom
 *   abrégé (décision 1b de l'audit UX) : un slug ne révèle rien que la fiche ne montre déjà.
 *   Le rôle est celui de {@see PublicProfileFacts::rolesPublics()}, le même que la fiche affiche.
 * · Minuscules ASCII seulement : l'unicité tient sous la collation déterministe de la base
 *   (`--locale=C`) sans repli de casse — deux casses d'un même nom ne peuvent pas coexister.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * COLLISIONS ET ANCIENNES ADRESSES
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Deux « Awa Diop » obtiennent `awa-diop` et `awa-diop-2`. Un candidat est libre s'il n'est, pour
 * AUCUN autre compte, ni le slug courant, ni un ancien slug, ni le `username` : la résolution de
 * `PublicAgentController` essaie ces trois niveaux dans cet ordre, et un slug neuf égal à
 * l'ancienne adresse ou au `username` d'un autre détournerait ses liens déjà partagés.
 *
 * Un slug qui change (nom modifié, rôle changé) garde le précédent dans
 * `metadata.previous_public_slugs` : l'ancienne adresse redirige en 301.
 *
 * Le calcul est IDEMPOTENT : un slug courant de la forme `<base>` ou `<base>-<n>` est conservé.
 * C'est ce qui rend `users:public-slugs` rejouable et sans effet sur un compte déjà juste.
 */
class PublicSlugService
{
    /** `users.public_slug` est un `string(120)` ; la base laisse la place d'un suffixe `-NNNN`. */
    public const LONGUEUR_BASE = 110;

    /**
     * Le slug que le nom et le rôle de ce compte appellent, sans suffixe — `null` sans nom.
     *
     * @param  'agent'|'owner'|null  $role  `null` : lu par {@see PublicProfileFacts::rolesPublics()}.
     */
    public function base(User $user, ?string $role = null): ?string
    {
        $role ??= PublicProfileFacts::rolesPublics([(int) $user->id])[(int) $user->id] ?? 'owner';

        $prenom = Str::slug((string) $user->first_name);
        $nom = Str::slug((string) $user->last_name);

        $parties = $role === 'agent'
            ? [$prenom, $nom]
            // Le propriétaire : l'initiale du nom, et seulement elle.
            : [$prenom, Str::substr($nom, 0, 1)];

        $base = implode('-', array_filter($parties, fn (string $p) => $p !== ''));
        $base = trim(Str::substr($base, 0, self::LONGUEUR_BASE), '-');

        return $base === '' ? null : $base;
    }

    /**
     * Pose sur le modèle (SANS l'enregistrer) le slug que son nom appelle, et garde le précédent.
     * Rend vrai si quelque chose a changé. Sans nom, rien ne change : un slug existant reste.
     */
    public function appliquer(User $user, ?string $role = null): bool
    {
        $base = $this->base($user, $role);
        if ($base === null) {
            return false;
        }

        $courant = $user->public_slug;
        if (is_string($courant) && preg_match('/^'.preg_quote($base, '/').'(-[0-9]+)?$/', $courant) === 1) {
            return false;
        }

        $nouveau = $this->candidatLibre($base, (int) $user->id);

        $metadata = is_array($user->metadata) ? $user->metadata : [];
        $anciens = array_values(array_filter(
            (array) ($metadata['previous_public_slugs'] ?? []),
            fn ($s) => is_string($s) && $s !== $nouveau,
        ));
        if (is_string($courant) && $courant !== '' && ! in_array($courant, $anciens, true)) {
            $anciens[] = $courant;
        }
        if ($anciens !== []) {
            $metadata['previous_public_slugs'] = $anciens;
            $user->metadata = $metadata;
        }

        $user->public_slug = $nouveau;

        return true;
    }

    /** {@see appliquer()}, puis enregistre — sans relancer le calcul du crochet de `User`. */
    public function assigner(User $user, ?string $role = null): bool
    {
        if (! $this->appliquer($user, $role)) {
            return false;
        }

        $user->saveQuietly();

        return true;
    }

    /**
     * Les comptes qui ont une fiche publique — la règle de `PublicAgentController::ficheOu404()`,
     * en SQL : actifs, et agents en exercice, inscrits à l'annuaire, ou porteurs d'une annonce
     * publique. C'est l'ensemble que `users:public-slugs` remplit.
     *
     * @return Builder<User>
     */
    public function comptesAvecFiche(): Builder
    {
        return User::query()
            ->where('users.status', UserStatus::Active)
            ->where(fn (Builder $q) => $q
                ->visibleDansLAnnuairePublic()
                ->orWhereIn('users.id', Property::query()->publicPortfolio()->select('user_id')));
    }

    /** Au-delà, le suffixe devient l'identifiant du compte — unique par construction. */
    private const SUFFIXES_MAX = 500;

    private function candidatLibre(string $base, int $userId): string
    {
        for ($n = 1; $n <= self::SUFFIXES_MAX; $n++) {
            $candidat = $n === 1 ? $base : "{$base}-{$n}";
            if (! $this->pris($candidat, $userId)) {
                return $candidat;
            }
        }

        return "{$base}-{$userId}";
    }

    private function pris(string $candidat, int $userId): bool
    {
        return User::withTrashed()
            ->whereKeyNot($userId)
            ->where(fn (Builder $q) => $q
                ->where('public_slug', $candidat)
                // Sans tenir compte de la casse : la fiche se résout d'abord par le slug REPLIÉ en
                // minuscules (`AgentPublic::parSlug`), donc `/agents/Awa-D`, lien partagé du
                // `username` `Awa-D`, mènerait au compte qui prendrait le slug `awa-d`.
                ->orWhereRaw(CaseInsensitive::sql('username').' = ?', [CaseInsensitive::fold($candidat)])
                ->orWhereJsonContains('metadata->previous_public_slugs', $candidat))
            ->exists();
    }
}
