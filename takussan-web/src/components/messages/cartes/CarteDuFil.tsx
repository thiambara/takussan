'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type {
  Message,
  ProjectionBail,
  ProjectionEcheance,
  ProjectionEtatDesLieux,
  ProjectionIntervention,
  ProjectionReservation,
  ProjectionVisite,
} from '@/types/message';

import { CarteNeutreBubble } from '../SystemMessageBubble';
import { useTexteMessageSysteme } from '../useTexteMessageSysteme';
import { CarteBien, type ProjectionBien } from '../poser/CarteBien';
import { CarteBail } from './CarteBail';
import { CarteEcheance } from './CarteEcheance';
import { CarteEtatDesLieux } from './CarteEtatDesLieux';
import { CarteIntervention, varianteDIntervention } from './CarteIntervention';
import { CarteReservation } from './CarteReservation';
import { CarteVisite } from './CarteVisite';
// TCK-2972 — l'engagement.
import { CarteEngagement } from '../engagements/CarteEngagement';
import type { ProjectionEngagement } from '../engagements/engagement';
import { IconeDEvenement, natureDeLIcone } from '../engagements/IconeDEvenement';
import { TraceDuLien } from '../pont/ElementsDuPont'; // TCK-2984

interface CarteDuFilProps {
  readonly message: Message;
  readonly conversationId: number;
  readonly moi: boolean;
  /** Dans un groupe, l'auteur d'une carte posée est nommé (comme une bulle). */
  readonly auteur: boolean;
}

/**
 * TCK-2962 (ADR-0128 § 3) — une carte dans le fil : une `card`, ou un `event` qui attend un geste de CE
 * lecteur. Ce qu'elle affiche vient de `object` — la projection de l'objet POUR CE LECTEUR et ses
 * `abilities` —, jamais de `metadata.data` ni d'une supposition sur le rôle ; `{indisponible: true}` rend
 * une carte discrète, sans titre ni détail. Le type vient de `metadata.object.type`.
 *
 * La ligne au-dessus de la carte dit qui l'a posée (une `card`), ou ce qui s'est passé (un `event`, son
 * texte composé depuis le code), et l'heure.
 */
export function CarteDuFil({ message, conversationId, moi, auteur }: CarteDuFilProps) {
  const t = useTranslations('messaging.cartes');
  const f = useFormatteurs();
  const texteSysteme = useTexteMessageSysteme();
  const heure = f.heure(message.created_at);
  const entete =
    message.type === 'event'
      ? t('parAuteur', { auteur: texteSysteme(message.metadata), heure })
      : auteur && !moi && message.sender?.full_name
        ? t('parAuteur', { auteur: message.sender.full_name, heure })
        : heure;

  const carte = rendreLaCarte(message, conversationId);
  if (carte === null) return <CarteNeutreBubble />;

  return (
    <li data-slot="place-de-la-carte" className={cn('flex flex-col', moi ? 'items-end' : 'items-start')}>
      <p className="mb-1 px-1 text-legende text-muted-foreground">{entete}</p>
      <div className="w-[88%] max-w-[calc(var(--spacing)*100)]">
        {carte}
        {/* TCK-2984 — la trace du lien d'action (envoyé · ouvert · fait), personnel seul : clé `action_link`. */}
        <TraceDuLien message={message} />
      </div>
    </li>
  );
}

function rendreLaCarte(message: Message, conversationId: number): React.ReactNode | null {
  const objet = message.object;
  if (!objet || 'indisponible' in objet) return <CarteIndisponible />;
  switch (message.metadata?.object?.type) {
    case 'maintenance_request':
      return <CarteIntervention objet={objet as unknown as ProjectionIntervention} variante={varianteDIntervention(message.metadata?.code)} conversationId={conversationId} />;
    case 'lease_payment':
      return <CarteEcheance objet={objet as unknown as ProjectionEcheance} conversationId={conversationId} />;
    case 'inventory':
      return <CarteEtatDesLieux objet={objet as unknown as ProjectionEtatDesLieux} />;
    case 'booking':
      return <CarteReservation objet={objet as unknown as ProjectionReservation} conversationId={conversationId} />;
    case 'property_visit':
      return <CarteVisite objet={objet as unknown as ProjectionVisite} conversationId={conversationId} />;
    case 'lease':
      return <CarteBail objet={objet as unknown as ProjectionBail} />;
    // TCK-2964 — le bien partagé.
    case 'property':
      return <CarteBien objet={objet as unknown as ProjectionBien} />;
    // TCK-2972 (ADR-0130) — l'engagement : la carte `commitment.noted`, et un événement qui attend CE lecteur.
    case 'commitment':
      return <CarteEngagement objet={objet as unknown as ProjectionEngagement} conversationId={conversationId} code={message.metadata?.code} />;
    default:
      // Un type que ce front ne sait pas encore rendre : la ligne neutre.
      return null;
  }
}

/** L'objet n'est pas lisible par ce lecteur, ou n'existe plus : rien de lui, ni titre ni détail. */
function CarteIndisponible() {
  const t = useTranslations('messaging.cartes');
  return (
    <p data-slot="carte-indisponible" className="rounded-2xl bg-muted/60 px-4 py-3 text-ui text-muted-foreground">
      {t('indisponible')}
    </p>
  );
}

/**
 * TCK-2962 — une suite d'événements repliée en UNE ligne (« 3 événements · … ») qui se déplie en un petit
 * journal, sans bulle (maquette `fil-cartes`, `Evenements`). Rien de replié ne demande un geste : un
 * événement qui attend le lecteur est une carte, hors de la suite.
 */
export function EvenementsReplies({
  messages,
  ouvertParDefaut = false,
  jour = false,
}: {
  readonly messages: readonly Message[];
  /** TCK-2963 — dans une salle, les événements du mois courant arrivent dépliés (AC4) ; ceux d'un mois passé, repliés. */
  readonly ouvertParDefaut?: boolean;
  /** TCK-2963 — sous un séparateur de MOIS, l'heure seule ne dit pas quand : le jour la précède. */
  readonly jour?: boolean;
}) {
  const t = useTranslations('messaging.cartes.evenements');
  const f = useFormatteurs();
  const texteSysteme = useTexteMessageSysteme();
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const textes = messages.map((m) => texteSysteme(m.metadata));
  const resume = textes.map((x) => x.replace(/[.。]\s*$/, '')).join(', ');
  const Chevron = ouvert ? ChevronUp : ChevronDown;
  // TCK-2972 — une suite d'événements d'engagement porte l'icône de son premier (poignée de main ou cloche).
  const codeDeLIcone = messages.map((m) => m.metadata?.code).find((c) => natureDeLIcone(c) !== null);

  return (
    <li data-slot="evenements-replies" className="mx-auto w-full max-w-[94%]">
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="flex min-h-10 w-full items-center gap-2 rounded-xl bg-muted/60 px-3 py-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        <IconeDEvenement code={codeDeLIcone} className="size-3.5 flex-none" testId="icone-d-engagement" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-foreground tabular-nums">{t('compte', { count: messages.length })}</span> · {resume}
        </span>
        <span className="sr-only">{ouvert ? t('replier') : t('deplier')}</span>
        <Chevron className="size-3.5 flex-none" aria-hidden="true" />
      </button>
      {ouvert ? (
        <ol className="mt-1 ml-4 border-l border-border pl-3">
          {messages.map((m, i) => (
            <li key={m.id} className="relative flex items-baseline gap-2 py-1 text-xs text-foreground">
              <span className="absolute top-2.5 -left-4 size-1.5 rounded-full bg-border" aria-hidden="true" />
              <LigneDuJournal code={m.metadata?.code} texte={textes[i]} />
              <span className="flex-none text-muted-foreground tabular-nums">
                {jour ? `${f.jourMois(m.created_at)} · ${f.heure(m.created_at)}` : f.heure(m.created_at)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** TCK-2972 — une ligne du journal déplié : l'icône d'un événement d'engagement devant son texte. */
function LigneDuJournal({ code, texte }: { readonly code: string | undefined; readonly texte: string | undefined }) {
  return (
    <span className="min-w-0 flex-1">
      <IconeDEvenement code={code} className="mr-1 inline size-3 align-[-0.125em]" />
      {texte}
    </span>
  );
}
