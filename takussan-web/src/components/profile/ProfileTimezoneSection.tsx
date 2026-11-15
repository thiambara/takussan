'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PiedDEnregistrement } from '@/components/profile/sommaire/PiedDEnregistrement';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProfileTimezoneSectionProps {
  /** Le fuseau du compte (`users.timezone`), `null` ou absent : Dakar, le défaut de la colonne. */
  readonly timezone?: string | null;
  /**
   * TCK-2635 — la vue d'ensemble du profil (maquette « Menu et affichage ») : le seul sélecteur, qui
   * enregistre au choix, comme la langue à côté de lui. Sans : la page « Fuseau horaire », son
   * formulaire et son « Enregistrer ».
   */
  readonly immediat?: boolean;
}

const FUSEAU_PAR_DEFAUT = 'Africa/Dakar';

/** Les fuseaux IANA que connaît le moteur, le fuseau du compte compris s'il n'y est pas. */
function fuseaux(courant: string): string[] {
  const liste = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return liste.includes(courant) ? liste : [courant, ...liste];
}

/**
 * TCK-1497 (P107.03, porteur 2026-10-22) — un fuseau par compte. Les notifications, les rappels
 * de visite et l'heure d'envoi du résumé se rendent dans `users.timezone` ; il n'avait aucun
 * écrivain. Il s'enregistre par le relais `PATCH /api/me` (`timezone`, `timezone:all` côté API).
 * Les dates des écrans du front restent à Dakar : ce réglage ne gouverne que les rendus de l'API.
 */
export function ProfileTimezoneSection({ timezone, immediat = false }: ProfileTimezoneSectionProps) {
  const t = useTranslations('profile.timezone');
  const tCommon = useTranslations('common.actions');
  const [enregistre, setEnregistre] = useState(timezone || FUSEAU_PAR_DEFAUT);
  const [choix, setChoix] = useState(enregistre);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const idFormulaire = useId();

  function enregistrerLe(valeur: string) {
    setRetour(null);
    demarrer(async () => {
      let ok = false;
      try {
        const res = await fetch('/api/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: valeur }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        setRetour({ ok: false, message: t('error') });
        if (immediat) setChoix(enregistre);
        return;
      }
      setEnregistre(valeur);
      setRetour({ ok: true, message: t('saved') });
    });
  }

  function enregistrer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    enregistrerLe(choix);
  }

  // TCK-2635 — le fuseau de la plateforme se dit « Dakar (GMT) », jamais « Africa/Dakar » ; la valeur
  // envoyée reste l'identifiant IANA. Les autres fuseaux, rares, gardent leur identifiant.
  const optionsFuseau = fuseaux(choix).map((fuseau) => ({
    value: fuseau,
    label: fuseau === FUSEAU_PAR_DEFAUT ? t('dakar') : fuseau,
  }));

  const selecteur = (
    <Select
      value={choix}
      onValueChange={(next) => {
        if (next === null) return;
        setChoix(next);
        if (immediat && next !== enregistre) enregistrerLe(next);
      }}
      items={optionsFuseau}
      disabled={immediat && enCours}
    >
      <SelectTrigger id={immediat ? 'profile-timezone-apercu' : 'profile-timezone'} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {optionsFuseau.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const message = retour ? (
    <p role="status" className={retour.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>
      {retour.message}
    </p>
  ) : null;

  if (immediat) {
    return (
      <div>
        <Label htmlFor="profile-timezone-apercu" className="mb-1.5">
          {t('label')}
        </Label>
        {selecteur}
        {message}
      </div>
    );
  }

  // TCK-2635 — à nu sous le titre de la section (« Fuseau horaire » et son aide) : un champ, un pied.
  return (
    <form id={idFormulaire} onSubmit={enregistrer}>
      <div className="space-y-1.5">
        <Label htmlFor="profile-timezone">{t('label')}</Label>
        {selecteur}
      </div>
      <PiedDEnregistrement
        modifications={choix === enregistre ? 0 : 1}
        bouton={
          <Button type="submit" form={idFormulaire} disabled={enCours || choix === enregistre}>
            {tCommon('save')}
          </Button>
        }
      >
        {message}
      </PiedDEnregistrement>
    </form>
  );
}
