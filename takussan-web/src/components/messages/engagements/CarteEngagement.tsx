'use client';

import { useState, type ReactNode } from 'react';
import { Handshake } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

import { CadreDeCarte, CLASSE_DU_GESTE, LienDeCarte, TexteDeCarte, TitreDeCarte, useErreurDuGeste, type TonDeLaCarte } from '../cartes/CadreDeCarte';
import { ENCRE_DE_L_ETAT, estClos, gestesPermis, joursDeRetard, type EtatDEngagement, type GesteDEngagement, type ProjectionEngagement } from './engagement';
import { FeuilleDEcheance, FeuilleDeReouverture } from './FeuillesDEngagement';
import { useGesteDEngagement } from './useGesteDEngagement';
import { useLectureSeule } from './useLectureSeule';

const TON: Readonly<Record<EtatDEngagement, TonDeLaCarte>> = {
  proposed: 'attend',
  open: 'calme',
  late: 'alerte',
  kept: 'fait',
  cancelled: 'calme',
};

interface CarteEngagementProps {
  readonly objet: ProjectionEngagement;
  readonly conversationId: number;
  /** `metadata.code` du message : `commitment.check_requested` pose la question « Tenu ? » au bénéficiaire. */
  readonly code?: string;
}

/**
 * TCK-2972 (ADR-0130 §§ 2 et 3) — la carte d'un engagement, lue pour SON lecteur depuis la projection :
 *
 * · « Votre engagement » pour le porteur, « Engagement de … » pour les autres ;
 * · chaque geste n'apparaît que si son `ability` est vraie (`gestesPermis`), et aucun sous impersonation.
 *   Le libellé seul dépend de qui lit (porteur, bénéficiaire, ou personnel) : jamais le droit ;
 * · « Tenu ? » : sur l'événement `commitment.check_requested` qui attend le bénéficiaire, « Oui, c'est
 *   fait » (`keep`) et « Pas encore » (`not_yet`) ;
 * · en retard : le retard en jours, dans l'encre d'alerte ;
 * · clos (tenu ou annulé) : une ligne, qui garde « Ce n'est pas fait » quand `reopen` est permis.
 *
 * Aucun texte n'est lu de l'API : seul le titre, saisie libre, s'affiche tel quel. Le motif d'une
 * réouverture n'est pas montré.
 */
export function CarteEngagement({ objet, conversationId, code }: CarteEngagementProps) {
  const t = useTranslations('messaging.engagements.carte');
  const f = useFormatteurs();
  const { user } = useAuth();
  const lectureSeule = useLectureSeule();
  const erreurDuGeste = useErreurDuGeste();
  const geste = useGesteDEngagement(conversationId);
  const [maintenant] = useState(() => new Date());
  const [feuille, setFeuille] = useState<null | 'autreDate' | 'modifier' | 'reouvrir'>(null);

  const permis = gestesPermis(objet, lectureSeule);
  const moi = user?.id;
  const porteur = objet.holder !== null && objet.holder.id === moi;
  const beneficiaire = objet.beneficiary !== null && objet.beneficiary.id === moi;
  const titre = objet.title?.trim() || t('sansTitre');
  const pour = porteur ? t('votre') : t('de', { nom: objet.holder?.name ?? '—' });
  const appeler = (g: GesteDEngagement) => geste.appeler({ geste: g, id: objet.id });
  const lien = (g: GesteDEngagement, libelle: string, action?: () => void) =>
    permis.has(g) ? (
      <LienDeCarte key={`${g}-${libelle}`} onClick={action ?? (() => appeler(g))} disabled={geste.isPending}>
        {libelle}
      </LienDeCarte>
    ) : null;
  const plein = (g: GesteDEngagement, libelle: string) => (
    <Button type="button" className={CLASSE_DU_GESTE} disabled={geste.isPending} aria-busy={geste.isPending || undefined} onClick={() => appeler(g)}>
      {libelle}
    </Button>
  );

  const feuilles = (
    <>
      {feuille === 'autreDate' ? (
        <FeuilleDEcheance
          conversationId={conversationId}
          engagementId={objet.id}
          open
          onOpenChange={(o) => !o && setFeuille(null)}
          geste={objet.etat === 'proposed' ? 'confirm' : 'update'}
          titre={porteur ? t('proposerUneAutreDate') : t('accorderUneNouvelleDate')}
        />
      ) : null}
      {feuille === 'modifier' ? (
        <FeuilleDEcheance
          conversationId={conversationId}
          engagementId={objet.id}
          open
          onOpenChange={(o) => !o && setFeuille(null)}
          geste="update"
          titre={t('modifier')}
          titreActuel={objet.title ?? ''}
        />
      ) : null}
      {feuille === 'reouvrir' ? <FeuilleDeReouverture conversationId={conversationId} engagementId={objet.id} open onOpenChange={(o) => !o && setFeuille(null)} /> : null}
    </>
  );

  // Clos : une ligne (maquette, le devis replié), qui garde « Ce n'est pas fait » quand `reopen` est permis.
  if (estClos(objet.etat)) {
    return (
      <div data-slot="engagement-replie" data-etat={objet.etat}>
        <p className="flex min-h-10 items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-ui">
          <Handshake className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <span className={cn('min-w-0 flex-1 truncate text-foreground', objet.etat === 'cancelled' && 'text-muted-foreground line-through')}>
            {pour} · {titre}
          </span>
          <span className={cn('flex-none font-medium', ENCRE_DE_L_ETAT[objet.etat])}>{t(`etat.${objet.etat}`)}</span>
        </p>
        {permis.has('reopen') ? <div className="mt-1 flex justify-center">{lien('reopen', t('pasFait'), () => setFeuille('reouvrir'))}</div> : null}
        {geste.error ? (
          <p role="alert" className="mt-1 text-ui text-destructive">
            {erreurDuGeste(geste.error)}
          </p>
        ) : null}
        {feuilles}
      </div>
    );
  }

  // « Tenu ? » : la question au bénéficiaire, une heure après l'échéance.
  const question = code === 'commitment.check_requested' && permis.has('not_yet');
  const echeance = objet.due_at ? f.dateTime(objet.due_at) : null;
  const jours = objet.etat === 'late' ? joursDeRetard(objet.due_at, maintenant) : 0;

  let principal: ReactNode = null;
  let liens: ReactNode[] = [];
  if (question) {
    principal = permis.has('keep') ? plein('keep', t('ouiCEstFait')) : null;
    liens = [lien('not_yet', t('pasEncore'))];
  } else {
    const libelleTenu = porteur || beneficiaire ? t('cEstFait') : t('marquerTenu');
    if (permis.has('confirm')) principal = plein('confirm', t('jeConfirme'));
    else if (permis.has('keep')) principal = plein('keep', libelleTenu);
    liens = [
      permis.has('confirm') ? lien('confirm', t('proposerUneAutreDate'), () => setFeuille('autreDate')) : null,
      permis.has('confirm') ? lien('keep', libelleTenu) : null,
      lien('update', porteur ? t('proposerUneAutreDate') : t('accorderUneNouvelleDate'), () => setFeuille('autreDate')),
      porteur ? null : lien('update', t('modifier'), () => setFeuille('modifier')),
      lien('remind', t('relancer')),
      lien('cancel', t('annuler')),
    ];
  }
  const liensPresents = liens.filter(Boolean);

  return (
    <CadreDeCarte
      type="engagement"
      quoi={
        <span className="inline-flex items-center gap-1.5">
          <Handshake className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {pour}
        </span>
      }
      etat={question ? t('etat.question') : t(`etat.${objet.etat}`)}
      ton={question ? 'attend' : TON[objet.etat]}
      geste={principal ?? undefined}
      liens={liensPresents.length > 0 ? liensPresents : undefined}
      erreur={erreurDuGeste(geste.error)}
    >
      {question ? <TexteDeCarte className="mt-0 mb-2">{t('question', { nom: objet.holder?.name ?? '—' })}</TexteDeCarte> : null}
      <TitreDeCarte>{titre}</TitreDeCarte>
      {echeance ? <TexteDeCarte>{t('echeance', { quand: echeance })}</TexteDeCarte> : null}
      {jours > 0 ? (
        <p data-slot="retard-de-l-engagement" className="mt-1 text-corps font-medium text-destructive">
          {t('enRetard', { jours })}
        </p>
      ) : null}
      <TexteDeCarte className="text-muted-foreground">{objet.beneficiary ? t('envers', { nom: beneficiaire ? t('vous') : objet.beneficiary.name }) : t('enversLAgence')}</TexteDeCarte>
      {feuilles}
    </CadreDeCarte>
  );
}
