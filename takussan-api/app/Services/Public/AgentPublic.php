<?php

namespace App\Services\Public;

use App\Http\Controllers\Public\PublicAgentController;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Search\ProfilDuFiltre;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

/**
 * La personne qu'une adresse `/agents/{slug}` désigne — UNE résolution, partagée par la fiche
 * ({@see PublicAgentController}) et par le filtre `agent=` de la liste publique ({@see ProfilDuFiltre}) :
 * une adresse qui sert la page filtre aussi la liste, et une adresse qui rend 404 la vide (TCK-2517, TCK-2519).
 */
final class AgentPublic
{
    /**
     * La personne publique de ce slug, ou `null`.
     *
     * TCK-2519 — trois niveaux, dans cet ordre : le slug au nom, un ANCIEN slug au nom (nom ou rôle
     * changé), puis le `username` (les liens d'avant le slug au nom). `PublicSlugService` interdit à un
     * slug neuf d'égaler l'ancien slug ou le `username` d'un autre compte : aucun niveau ne détourne les
     * liens d'un autre. Le slug est en minuscules ASCII : `Awa-Diop` y mène aussi.
     *
     * TCK-2506 — un particulier n'a de fiche que si une de ses annonces publiques y mène, ou s'il a choisi
     * l'annuaire ; un agent en exercice garde la sienne sans annonce. La règle est jugée APRÈS la
     * résolution, au même titre pour les trois niveaux : une ancienne adresse ne mène jamais à une fiche
     * qui n'est plus publique.
     *
     * @param  list<string>  $with
     */
    public function parSlug(string $slug, array $with = []): ?User
    {
        $base = fn () => self::sansAgenceHorsLigne(User::query())
            ->where('users.status', UserStatus::Active)
            ->with($with);

        $replie = Str::lower($slug);
        $agent = $base()->where('users.public_slug', $replie)->first()
            ?? $base()->whereNotNull('users.public_slug')
                ->whereJsonContains('users.metadata->previous_public_slugs', $replie)
                ->orderBy('users.id')
                ->first()
            ?? $base()->where('users.username', $slug)->first();

        return $agent !== null && self::aUneFichePublique($agent) ? $agent : null;
    }

    /**
     * TCK-600 (ADR-0048 §1, verif-600 M2) — un agent rattaché, par un profil d'agent, à une
     * agence qui n'est pas `active` (suspendue ou désactivée) n'a pas de page publique : sa fiche,
     * son portefeuille et son contact rendent le 404 d'un agent inconnu, l'index ne le liste pas
     * (sinon il mènerait à ce 404), et le filtre `agent=` de la liste rend zéro bien. Même règle que
     * l'annuaire des agences. Sans elle, la fiche affichait l'agence suspendue et le téléphone de
     * l'agent, et `contactLead` déposait une demande dans une agence qui ne peut plus écrire.
     *
     * Un agent de deux agences dont l'une est hors ligne est masqué : la page ne choisit pas entre
     * ses enseignes, elle s'abstient.
     *
     * verif-600 m-A — TOUT profil, quel que soit son statut : `show` et `contactLead` lisent l'agence
     * par `User::agency()`, qui ne filtre pas le statut. Un masque qui ne jugeait que le profil
     * `active` laissait la page (agence suspendue affichée) et le contact d'un agent `inactive`,
     * `suspended` ou `draft`. Le masque et la page lisent désormais la même relation.
     */
    public static function sansAgenceHorsLigne(Builder $query): Builder
    {
        return $query->whereDoesntHave('agentProfiles', fn (Builder $profil) => $profil
            ->whereHas('agency', fn (Builder $agence) => $agence->where('agencies.status', '!=', AgencyStatus::Active)));
    }

    private static function aUneFichePublique(User $user): bool
    {
        $id = (int) $user->id;

        return $user->listed_in_public_directory
            || PublicProfileFacts::rolesPublics([$id])[$id] === 'agent'
            || Property::query()->where('user_id', $id)->publicPortfolio()->exists();
    }
}
