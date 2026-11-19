'use client';

import { useId } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Lock, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { initiales } from '@/lib/fiche-publique';
import { cn } from '@/lib/utils';
import type { Personne } from './equipe';

/**
 * TCK-2968 (maquette `fil-cartes` D, `ComposeurD`) — la ligne au-dessus du champ : QUI lira ce message, et
 * l'interrupteur « Équipe », discret, pour le personnel seulement. La destination se lit sans bordure :
 * cette ligne (« Lu par l'équipe seulement — pas par … »), la teinte ocre du champ, son texte d'attente et
 * le bouton « Noter » (`ChatView`).
 *
 * Un client n'a jamais l'interrupteur (`equipeLit` faux), ni aucun mot qui parle de notes d'équipe.
 */
export function LigneDesLecteurs({
  equipeLit,
  equipe,
  onEquipe,
  personnel,
  autres,
  indisponible,
}: {
  /** L'appelant écrit-il des notes dans ce fil ? Faux : ni interrupteur, ni mot d'équipe. */
  readonly equipeLit: boolean;
  readonly equipe: boolean;
  readonly onEquipe: (actif: boolean) => void;
  readonly personnel: readonly Personne[];
  readonly autres: readonly Personne[];
  /** Une pièce jointe ou une note vocale en cours : la destination ne change pas sous elles. */
  readonly indisponible?: boolean;
}) {
  const t = useTranslations('messaging.composer.equipe');
  const tRelation = useTranslations('messaging.group.info.relation');
  const format = useFormatter();
  const idLigne = useId();
  const nomme = (p: Personne) =>
    p.relation && tRelation.has(p.relation) ? t('nomEtRelation', { nom: p.nom, relation: tRelation(p.relation).toLowerCase() }) : p.nom;
  const tous = [...personnel, ...autres];
  const exclus = autres.map((p) => p.nom.split(' ')[0] ?? p.nom);
  const texte = equipe
    ? exclus.length > 0
      ? t('luParEquipe', { exclus: format.list(exclus, { type: 'disjunction' }) })
      : t('luParEquipeSeule')
    : tous.length > 0
      ? t('luPar', { noms: format.list(tous.map(nomme), { type: 'conjunction' }) })
      : null;
  if (!texte && !equipeLit) return null;
  return (
    <div className="mb-2 flex items-start gap-3" data-slot="lecteurs-du-composeur">
      <p
        id={idLigne}
        data-testid="lu-par"
        className={cn('flex min-w-0 flex-1 items-start gap-1.5 pt-0.5 text-xs leading-snug', equipe ? 'font-medium text-warning' : 'text-muted-foreground')}
      >
        {equipe ? <Lock className="mt-px size-3.5 flex-none" strokeWidth={2.25} aria-hidden /> : <Users className="mt-px size-3.5 flex-none" aria-hidden />}
        <span>{texte}</span>
      </p>
      {equipeLit ? (
        <label className="flex flex-none cursor-pointer items-center gap-2 text-xs font-medium text-encre-douce">
          {t('interrupteur')}
          <Switch
            checked={equipe}
            onCheckedChange={(actif) => onEquipe(actif)}
            disabled={indisponible && !equipe}
            aria-describedby={idLigne}
            title={indisponible && !equipe ? t('indisponible') : undefined}
            data-testid="interrupteur-equipe"
            className="data-checked:bg-warning"
          />
        </label>
      ) : null}
    </div>
  );
}

/**
 * TCK-2968 — la liste des mentionnables, ouverte par `@` au-dessus du champ : les seules personnes qui
 * liront ce message (le personnel pour une note). Une option se choisit au clic, ou par ↑ ↓ et Entrée
 * depuis le champ (`ChatView` tient la sélection).
 */
export function ListeDesMentions({
  id,
  personnes,
  active,
  note,
  onChoisir,
}: {
  readonly id: string;
  readonly personnes: readonly Personne[];
  readonly active: number;
  readonly note: boolean;
  readonly onChoisir: (p: Personne) => void;
}) {
  const t = useTranslations('messaging.composer.mentions');
  const tRelation = useTranslations('messaging.group.info.relation');
  if (personnes.length === 0) return null;
  return (
    <div className="mb-2 rounded-2xl bg-card p-1.5 shadow-panneau-cloche" data-testid="liste-des-mentions">
      <p className="px-2.5 pt-1 pb-1 text-xs text-muted-foreground">{note ? t('titreNote') : t('titre')}</p>
      <ul id={id} role="listbox" aria-label={t('liste')}>
        {personnes.map((p, i) => (
          <li
            key={p.id}
            id={`${id}-${p.id}`}
            role="option"
            aria-selected={i === active}
            // `onMouseDown` : le champ garde le focus (et son curseur) pendant le choix.
            onMouseDown={(e) => {
              e.preventDefault();
              onChoisir(p);
            }}
            className={cn('flex h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2.5', i === active && 'bg-muted')}
          >
            <Avatar size="28">
              {p.avatar ? <AvatarImage src={p.avatar} alt="" /> : null}
              <AvatarFallback>{initiales(p.nom)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nom}</span>
            {p.relation && tRelation.has(p.relation) ? (
              <span className="flex-none text-xs text-muted-foreground">{tRelation(p.relation)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
