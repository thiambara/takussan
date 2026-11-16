'use client';

import { useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';

import type { ResumeDesInterventions } from '@/types/lease';

import { Carte, LigneLien } from './PiecesDeLaLocation';

/**
 * TCK-2908 — la carte « 1 intervention en cours » de la colonne de droite (maquette `app-biens` a-2,
 * bureau) : le compte des interventions ouvertes du bien que le lecteur lit (`maintenance_summary`,
 * TCK-2906), puis le titre et l'état de la dernière ouverte (« Rideau métallique · Devis demandé »). Elle
 * mène à cette intervention (`/app/maintenance/{id}`). Sans intervention ouverte — ou sans résumé servi —
 * rien n'est rendu.
 */
export function CarteInterventionsEnCours({ resume }: { readonly resume: ResumeDesInterventions | null }) {
  const t = useTranslations('propertyDashboard.fiche.interventions');
  const tStatut = useTranslations('maintenance.status');
  if (!resume || resume.open < 1) return null;
  const derniere = resume.latest_open;
  const statut = derniere?.status && tStatut.has(derniere.status) ? tStatut(derniere.status) : null;
  const detail = [derniere?.title?.trim() || null, statut].filter(Boolean).join(' · ') || null;
  return (
    <Carte>
      <div data-testid="carte-interventions-en-cours">
        <LigneLien
          href={derniere ? `/app/maintenance/${derniere.id}` : '/app/maintenance'}
          icone={<Wrench className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
          titre={t('enCours', { count: resume.open })}
          detail={detail}
        />
      </div>
    </Carte>
  );
}
