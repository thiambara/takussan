'use client';

import { useTranslations } from 'next-intl';
import { ProfileSwitcher } from '@/components/profile/ProfileSwitcher';
import type { Persona } from '@/lib/navigation/personas';
import type { User } from '@/types/user';

interface EnTeteDEspaceProps {
  readonly user: User;
  readonly persona: Persona;
}

/**
 * TCK-2478 (ADR-0089) — l'en-tête d'espace, en haut de la barre de `/app` : une carte compacte qui
 * nomme l'agence et le persona (« Agence Teranga · Administrateur ») et ouvre le sélecteur de
 * profil quand il y a de quoi choisir.
 *
 * Précieuse dans le tiroir mobile, qui recouvre la barre haute — et son sélecteur, qui ne bouge
 * pas. C'est le MÊME sélecteur (`ProfileSwitcher`, variante `carte`) : une seule source pour la
 * liste des espaces (`espacesAProposer`, TCK-497) et pour la bascule.
 */
export function EnTeteDEspace({ user, persona }: EnTeteDEspaceProps) {
  const t = useTranslations('nav.sidebar');
  return (
    <div className="px-3 pb-3 md:pt-5">
      <ProfileSwitcher
        user={user}
        variante="carte"
        libelle={t(`personas.${persona}`)}
        libelleChanger={t('enTete.changer')}
      />
    </div>
  );
}
