'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowRight, Building2, ChevronRight, ReceiptText, ShieldCheck, UserPlus } from 'lucide-react';
import type { ComponentType } from 'react';

import { StatusBadge, type StatusTone } from '@/components/console';
import { useAuth } from '@/context/AuthContext';
import {
  agencyKycQueryOptions,
  kycDemandeUnGeste,
  pendingInvitationsCountQueryOptions,
  propertyModerationCountQueryOptions,
} from '@/lib/queries/agency-queues';
import type { KycDossierStatus } from '@/types/super-admin';
import { cn } from '@/lib/utils';

/**
 * TCK-375 — le bloc de FILES D'ATTENTE de `/admin`, en tête de l'écran.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC CHANGE, ET POURQUOI IL EST EN TÊTE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `/admin` ouvrait sur six tuiles KPI : un écran de CONSTAT. Rien n'y disait qu'une action était
 * attendue, et rien n'y menait. L'ordre de lecture porte la priorité — *ce qui demande un geste
 * passe avant ce qui décrit un état* — donc les files montent au-dessus des KPI, qui restent.
 *
 * **Chaque ligne est un chemin, jamais un chiffre.** Un compteur sans destination ne dit à
 * personne ce qu'il faut en faire ; c'est ce qui faisait des six tuiles un tableau de bord
 * qu'on regarde au lieu d'un tableau de bord dont on se sert.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * UNE FILE VIDE NE SE MASQUE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * « Rien à traiter » est une information que l'admin vient chercher : la ligne reste, calmement,
 * avec son libellé. Masquer une file vide obligerait à se demander, chaque fois, si elle est
 * vide ou si l'écran est cassé.
 *
 * ⚠ D'où une distinction que le rendu tient explicitement : une file VIDE (`0`) et un compte
 * INDISPONIBLE (requête en erreur) ne s'écrivent pas pareil. Les deux rendraient « 0 » si on
 * affichait le nombre nu, et « 0 » sur une panne est un mensonge tranquille.
 */

/** Les quatre files. La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
type QueueId = 'kyc' | 'moderation' | 'invitations' | 'overdue';

const ICONES: Record<QueueId, ComponentType<{ className?: string }>> = {
  kyc: ShieldCheck,
  moderation: Building2,
  invitations: UserPlus,
  overdue: ReceiptText,
};

/**
 * Les destinations. Chacune est l'écran qui permet de TRAITER la file, dans la console où
 * l'utilisateur se trouve déjà.
 *
 * ⚠ `?tab=impayes` n'est pas un ornement : `AdminFinancesTabs` lit son onglet dans `?tab=`
 * (`searchParams.get('tab')`) et ouvre sinon sur « encaissements ». Un lien nu vers
 * `/admin/finances` aurait mené à côté de ce que la ligne annonce.
 */
const DESTINATIONS: Record<QueueId, string> = {
  kyc: '/admin/agency/kyc',
  moderation: '/admin/moderation/properties',
  invitations: '/admin/team',
  overdue: '/admin/finances?tab=impayes',
};

/**
 * Le ton de chaque statut KYC. `submitted` est délibérément `info` et non `attention` : le
 * dossier est chez la plateforme, l'agence n'a rien à faire — le signaler comme une tâche
 * fabriquerait une file qui n'existe pas.
 */
const TONS_KYC: Record<KycDossierStatus, StatusTone> = {
  pending: 'attention',
  submitted: 'info',
  rejected: 'danger',
  verified: 'success',
};

interface AgencyQueuesProps {
  /** `null` quand aucune agence ne se résout — les files qui en dépendent ne se demandent pas. */
  readonly agencyId: number | null;
  /**
   * `false` en agence `individual`, `undefined` quand on n'a pas pu savoir.
   *
   * ⚠ La distinction est la même que celle d'`AdminSidebar` : `undefined` laisse la file
   * affichée, `false` la retire. Écraser l'inconnu en `false` ferait disparaître des files
   * légitimes sur une panne passagère de `/api/agencies/{id}`.
   */
  readonly agencyIsStandard?: boolean;
  /**
   * Le nombre d'échéances impayées, **calculé par le serveur** et déjà présent dans la charge de
   * `/api/dashboard/agency` (`finance.overdue_count`). Aucune requête de plus : le compte est là,
   * il ne manquait qu'un chemin vers l'onglet qui le traite.
   */
  readonly overdueCount: number;
}

/** `undefined` = on ne sait pas (panne, requête désactivée) — distinct de `0`. */
type Compte = number | undefined;

export function AgencyQueues({ agencyId, agencyIsStandard, overdueCount }: AgencyQueuesProps) {
  const t = useTranslations('dashboard.agencyQueues');
  const { token } = useAuth();

  const kyc = useQuery(agencyKycQueryOptions(agencyId));
  const moderation = useQuery(propertyModerationCountQueryOptions(token ?? null, agencyIsStandard));
  const invitations = useQuery(
    pendingInvitationsCountQueryOptions(token ?? null, agencyIsStandard),
  );

  // Une agence `individual` n'a ni modération de biens ni invitations internes : les files
  // correspondantes ne sont pas rendues, et leur absence n'est pas une erreur — il n'y a donc
  // rien à afficher à leur place.
  const proActif = agencyIsStandard !== false;

  return (
    <section aria-labelledby="agency-queues-heading" className="rounded-2xl bg-card p-6">
      <header className="mb-1">
        <h2 id="agency-queues-heading" className="text-sm font-semibold text-foreground">
          {t('heading')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('subheading')}</p>
      </header>

      <ul className="mt-4 divide-y divide-border">
        <QueueRow
          id="kyc"
          label={t('items.kyc.label')}
          valeur={
            <StatusBadge
              // Un statut absent — chargement, panne, agence non résolue — n'est PAS un statut
              // neutre : on dit qu'on ne sait pas, plutôt que d'inventer un quatrième état.
              label={kyc.data ? t(`kycStatus.${kyc.data}`) : t('unavailable')}
              tone={kyc.data ? TONS_KYC[kyc.data] : 'neutral'}
              data-testid="queue-value-kyc"
            />
          }
          aTraiter={kycDemandeUnGeste(kyc.data)}
          cta={t('items.kyc.cta')}
        />

        {proActif ? (
          <QueueRow
            id="moderation"
            label={t('items.moderation.label')}
            valeur={<CompteRendu id="moderation" compte={compte(moderation)} />}
            aTraiter={(compte(moderation) ?? 0) > 0}
            cta={t('items.moderation.cta')}
          />
        ) : null}

        {proActif ? (
          <QueueRow
            id="invitations"
            label={t('items.invitations.label')}
            valeur={<CompteRendu id="invitations" compte={compte(invitations)} />}
            aTraiter={(compte(invitations) ?? 0) > 0}
            cta={t('items.invitations.cta')}
          />
        ) : null}

        <QueueRow
          id="overdue"
          label={t('items.overdue.label')}
          valeur={<CompteRendu id="overdue" compte={overdueCount} />}
          aTraiter={overdueCount > 0}
          cta={t('items.overdue.cta')}
        />
      </ul>
    </section>
  );
}

/** Le compte d'une requête, ou `undefined` si elle a échoué ou n'a pas encore répondu. */
function compte(query: { data?: number; isError: boolean }): Compte {
  return query.isError ? undefined : query.data;
}

/**
 * Le nombre d'une file — ou son absence.
 *
 * Trois rendus pour trois choses différentes, et c'est le point de tout ce composant : « rien à
 * traiter » (0), « je ne sais pas » (panne / chargement) et « n éléments » ne se confondent pas.
 *
 * Le nombre reste en corps de texte, délibérément : le grand nombre en gros caractères est le
 * patron par défaut de tous les back-offices et ne dit rien de plus qu'un nombre lisible bien
 * placé.
 */
function CompteRendu({ id, compte: valeur }: { id: QueueId; compte: Compte }) {
  const t = useTranslations('dashboard.agencyQueues');

  if (valeur === undefined) {
    return (
      <span className="text-sm text-muted-foreground" data-testid={`queue-value-${id}`}>
        {t('unavailable')}
      </span>
    );
  }
  if (valeur === 0) {
    return (
      <span className="text-sm text-muted-foreground" data-testid={`queue-value-${id}`}>
        {t('empty')}
      </span>
    );
  }
  // ⚠ Le nombre est formaté par ICU (`#`) à partir de la locale du provider next-intl, JAMAIS par
  // un `formatNumber(v, 'fr')`. Les six tuiles KPI d'à côté figent encore `'fr'` en dur : un
  // utilisateur en `en` y lit des séparateurs français. Ce bloc-ci ne reconduit pas le motif.
  return (
    <span
      className="text-sm font-semibold tabular-nums text-foreground"
      data-testid={`queue-value-${id}`}
    >
      {t(`items.${id}.count`, { count: valeur })}
    </span>
  );
}

function QueueRow({
  id,
  label,
  valeur,
  aTraiter,
  cta,
}: {
  id: QueueId;
  label: string;
  valeur: React.ReactNode;
  aTraiter: boolean;
  cta: string;
}) {
  const Icon = ICONES[id];
  return (
    <li data-testid={`queue-row-${id}`} className="py-3 first:pt-0 last:pb-0">
      <Link
        href={DESTINATIONS[id]}
        className="group flex items-center gap-4 rounded-lg px-2 py-1 transition-colors hover:bg-muted/60"
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full',
            aTraiter ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block">{valeur}</span>
        </span>
        <span className="hidden items-center gap-1 text-xs font-semibold text-primary sm:inline-flex">
          {cta}
          <ArrowRight className="size-3" aria-hidden />
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground sm:hidden"
          aria-hidden
        />
      </Link>
    </li>
  );
}
