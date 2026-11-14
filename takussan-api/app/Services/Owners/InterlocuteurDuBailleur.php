<?php

namespace App\Services\Owners;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Public\AgentPublic;

/**
 * TCK-2838 — la personne qui, à l'agence, s'occupe d'un bailleur invité.
 *
 * La règle :
 *  1. l'invitant de la DERNIÈRE invitation qui désigne CE profil (`invitable_*`) au nom de CETTE agence
 *     (`invitations.agency_id = owner_profiles.agency_id`), s'il y est encore membre actif — profil d'agent ou
 *     d'administrateur `active` dans cette agence, compte `active` ;
 *  2. sinon l'agence elle-même ;
 *  3. rien seulement quand il n'y a ni nom ni numéro (décision de team-lead du 2026-11-14) : un invitant actif sans
 *     aucun numéro public reste montré — son nom, son rôle — sans numéro (`phone: null`), le bailleur sait qui le suit.
 *
 * Le numéro (décision 1 du ticket, option a′ de team-lead du 2026-11-14) : le principal VÉRIFIÉ de l'invitant
 * ({@see User::numeroPrincipalPublic()}) seulement s'il est DÉJÀ publié, c'est-à-dire si sa fiche publique est servie
 * ({@see self::aUneFicheServie()}, la règle même de `GET /api/public/agents/{slug}`) ; sinon le téléphone public de
 * l'agence, le nom de l'invitant restant. Aucun numéro ne sort ici qui ne soit déjà public. Jamais le second numéro. WhatsApp seulement sur un numéro de l'invitant
 * déclaré WhatsApp (`users.phone_whatsapp`) : l'agence n'a pas de drapeau.
 */
class InterlocuteurDuBailleur
{
    /** @return array{source: 'inviter'|'agency', first_name: ?string, last_name: ?string, role: 'agent'|'agency_admin'|'agency', phone: ?string, whatsapp: bool}|null */
    public function pour(OwnerProfile $profil): ?array
    {
        if ($profil->agency_id === null) {
            return null;
        }
        $agence = Agency::query()->find((int) $profil->agency_id);
        $numeroDeLAgence = is_string($agence?->phone) && $agence->phone !== '' ? $agence->phone : null;

        $invitant = $this->invitant($profil);
        $role = $invitant === null ? null : $this->role($invitant, (int) $profil->agency_id);
        if ($invitant !== null && $role !== null) {
            $numero = $this->aUneFicheServie($invitant) ? $invitant->numeroPrincipalPublic() : null;
            $prenom = $invitant->first_name ?: null;
            $nom = $invitant->last_name ?: null;
            if ($prenom !== null || $nom !== null || $numero !== null || $numeroDeLAgence !== null) {
                return [
                    'source' => 'inviter',
                    'first_name' => $prenom,
                    'last_name' => $nom,
                    'role' => $role,
                    'phone' => $numero ?? $numeroDeLAgence,
                    'whatsapp' => $numero !== null && $invitant->phone_whatsapp === true,
                ];
            }
        }

        $nomDeLAgence = is_string($agence?->name) && trim($agence->name) !== '' ? $agence->name : null;

        return $numeroDeLAgence === null && $nomDeLAgence === null ? null : [
            'source' => 'agency',
            'first_name' => null,
            'last_name' => null,
            'role' => 'agency',
            'phone' => $numeroDeLAgence,
            'whatsapp' => false,
        ];
    }

    private function invitant(OwnerProfile $profil): ?User
    {
        $invitation = Invitation::query()
            ->where('invitable_type', $profil->getMorphClass())
            ->where('invitable_id', $profil->getKey())
            ->where('agency_id', $profil->agency_id)
            ->whereNotNull('invited_by')
            ->orderByDesc('id')
            ->first();

        $invitant = $invitation?->inviter;

        return $invitant !== null && $invitant->status === UserStatus::Active ? $invitant : null;
    }

    /**
     * La fiche publique de l'invitant est servie : son slug résout, par {@see AgentPublic::parSlug()}, vers lui-même
     * (compte actif, agence en ligne, fiche publique). C'est la page qui publie déjà son numéro (TCK-441, TCK-633).
     */
    private function aUneFicheServie(User $invitant): bool
    {
        $slug = $invitant->slugDeFiche();

        return is_string($slug) && $slug !== '' && app(AgentPublic::class)->parSlug($slug)?->is($invitant) === true;
    }

    /** @return 'agent'|'agency_admin'|null */
    private function role(User $invitant, int $agencyId): ?string
    {
        if ($invitant->isAgencyAdminAt($agencyId)) {
            return 'agency_admin';
        }

        return $invitant->isAgentAt($agencyId) ? 'agent' : null;
    }
}
