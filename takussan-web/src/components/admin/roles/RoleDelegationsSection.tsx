'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock, Plus } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CreateDelegationDialog } from './CreateDelegationDialog';
import { RevokeDelegationDialog } from './RevokeDelegationDialog';
import { useRoleDelegations } from '@/lib/queries/role-delegations';
import { useCanAll } from '@/hooks/useCan';
import { useFormatDate } from '@/i18n/hooks';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  ROLE_DELEGATION_STATUSES,
  estDelegationRevocable,
  type RoleDelegation,
  type RoleDelegationStatus,
} from '@/types/role-delegation';

/**
 * Référence figée hors composant : `useCanAll` mémoïse sur la RÉFÉRENCE du
 * tableau, un littéral inline en recréerait une à chaque rendu.
 *
 * ⚠️ **`team.assign_role` est un choix, et il faut savoir lequel.** Le
 * catalogue `Capability` n'a **aucun** cas `delegations.*` — mesuré :
 * `grep -i delegat app/Models/Enums/Capability.php` ne rend rien. Déléguer un
 * rôle est le geste dont `team.assign_role` est le plus proche : c'est le
 * verbe « attribuer un rôle à un membre », borné dans le temps.
 *
 * ⚠️⚠️ **Et la policy du backend, elle, ne consulte PAS cette capacité.**
 * `RoleDelegationPolicy::viewAny` répond `primary_admin_id === user->id ||
 * $user->isAgencyAdminAt($agency)` — un TYPE de profil, pas une capacité.
 * Un `agency_admin` porteur d'un rôle personnalisé privé de
 * `team.assign_role` ne verra donc pas le bouton **et serait pourtant
 * accepté** s'il postait la requête à la main. Cacher le bouton reste utile
 * (ne pas proposer ce qui n'a pas été accordé) mais ce n'est ici, encore
 * moins qu'ailleurs, une garde. Aligner la policy sur une capacité est du
 * backend, que TCK-369 exclut explicitement de son périmètre.
 */
const CAP_DELEGATE = ['team.assign_role'] as const;

/**
 * Le poids visuel de chaque statut — et il n'est pas décoratif.
 *
 * Une délégation `active` produit des droits **en ce moment** : elle porte la
 * couleur pleine du primaire. `scheduled` est une promesse, pas un effet :
 * contour neutre. `expired` s'efface sans disparaître — c'est la demande
 * explicite du ticket, la trace reste lisible. `revoked` est le seul statut
 * qui raconte une INTERRUPTION, et il se lit en destructif.
 *
 * Les quatre variantes sont distinctes deux à deux, et un test le vérifie sur
 * les classes rendues : si elles convergeaient, il rougirait.
 */
type VarianteBadge = 'default' | 'outline' | 'ghost' | 'destructive';

const STATUS_BADGE: Record<RoleDelegationStatus, VarianteBadge> = {
  active: 'default',
  scheduled: 'outline',
  expired: 'ghost',
  revoked: 'destructive',
};

/** Une délégation close ne réclame plus l'œil : la ligne entière recule. */
const STATUS_ROW: Record<RoleDelegationStatus, string> = {
  active: '',
  scheduled: '',
  expired: 'opacity-60',
  revoked: 'opacity-60',
};

/**
 * **Le statut que le serveur écrit n'est pas toujours le statut qui produit
 * un effet, et l'écart dure jusqu'à cinq minutes.**
 *
 * Mesuré dans `HasProfiles::hasActiveAgencyDelegation()` — la seule fonction
 * qu'une policy consulte pour honorer une délégation :
 *
 * ```php
 * ->where('status', RoleDelegationStatus::Active)
 * ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()))
 * ```
 *
 * Les droits tombent donc **à `ends_at`, à la seconde**. La colonne `status`,
 * elle, ne passe à `expired` qu'au passage de `ProcessRoleDelegationsJob`, que
 * `config('role_delegations.scheduler_interval_minutes')` fixe à **5**. Entre
 * les deux, l'API sert `status: "active"` pour une délégation qui n'accorde
 * plus rien.
 *
 * Afficher « Active » là-dessus, c'est rassurer sur des droits qui n'existent
 * plus — et proposer une révocation qui ne changerait rien. Le rendu se fait
 * donc sur le statut EFFECTIF. Ce n'est pas le front qui refait la règle : il
 * lit la même condition que la policy, sur les mêmes données.
 *
 * ⚠️ La symétrie n'est PAS vraie pour `scheduled` : une délégation dont le
 * `starts_at` est passé n'accorde rien tant que le job ne l'a pas activée
 * (`status` doit valoir `Active`). « Programmée » y reste donc exact, et la
 * corriger en « Active » serait le mensonge inverse.
 */
export function statutEffectif(
  delegation: RoleDelegation,
  maintenant: number = Date.now(),
): RoleDelegationStatus {
  if (delegation.status !== 'active') return delegation.status;
  if (!delegation.ends_at) return 'active';

  const fin = new Date(delegation.ends_at).getTime();
  if (Number.isNaN(fin)) return 'active';

  return fin > maintenant ? 'active' : 'expired';
}

/**
 * L'ordre de lecture : par statut d'abord (actif → programmé → clos), puis du
 * plus récemment créé au plus ancien à l'intérieur d'un statut.
 *
 * Trié ICI et non par `sort=` : envoyer un `sort=` à cet endpoint ne rend pas
 * une erreur — il DÉ-TRIE la liste en silence (mesure et détail dans l'en-tête
 * de `lib/queries/role-delegations.ts`). Le tri d'affichage n'est de toute
 * façon pas exprimable en SQL simple : c'est un ordre sur une énumération.
 */
function ordonne(
  delegations: readonly RoleDelegation[],
  maintenant: number,
): RoleDelegation[] {
  const rang = (s: RoleDelegationStatus) => ROLE_DELEGATION_STATUSES.indexOf(s);
  return [...delegations].sort((a, b) => {
    const parStatut = rang(statutEffectif(a, maintenant)) - rang(statutEffectif(b, maintenant));
    if (parStatut !== 0) return parStatut;
    return b.id - a.id;
  });
}

interface RoleDelegationsSectionProps {
  readonly agencyId: number;
}

/**
 * TCK-369 — les délégations temporaires, sur `/admin/roles`.
 *
 * TCK-108 a livré le modèle, le job, les policies et les trois endpoints, et
 * **aucun écran** : ses dix critères d'acceptation portaient tous sur le
 * backend, si bien qu'ils pouvaient être cochés en entier sans qu'une ligne
 * de front existe. C'est ce que cette section répare.
 *
 * Elle vit sous la console des rôles parce qu'une délégation est une
 * *dérogation dans le temps* à ce que la console au-dessus définit : on lit
 * d'abord ce qu'un rôle permet, ensuite qui l'emprunte et jusqu'à quand.
 */
export function RoleDelegationsSection({ agencyId }: RoleDelegationsSectionProps) {
  const t = useTranslations('admin.roles.role_delegations');
  const tCommon = useTranslations('common.actions');
  const formatDate = useFormatDate();
  const messageErreur = useMessageErreurApi();

  const delegationsQuery = useRoleDelegations(agencyId);
  const { can: canDelegate } = useCanAll(CAP_DELEGATE, { agencyId });

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<RoleDelegation | null>(null);

  /**
   * L'instant de référence du rendu, et il n'est **pas** `Date.now()`.
   *
   * Deux raisons, dans cet ordre :
   *
   *  1. **Sémantique.** L'écart entre `ends_at` et le statut servi se juge par
   *     rapport au moment où la liste a été LUE. `dataUpdatedAt` est cet
   *     instant ; il avance à chaque refetch, donc une délégation qui expire
   *     pendant que l'écran est ouvert bascule à la prochaine lecture — au
   *     même moment que la donnée qui la porte. Un `Date.now()` ferait
   *     basculer l'affichage sans que rien n'ait été relu.
   *  2. **Pureté.** `Date.now()` pendant le rendu est refusé par le React
   *     Compiler (`Cannot call impure function during render`, mesuré) : le
   *     composant entier serait abandonné à la compilation.
   *
   * Le repli passe par un initialiseur paresseux de `useState` — évalué une
   * fois, hors du corps de rendu — et couvre le premier rendu ainsi que tout
   * appelant qui double le hook sans fournir `dataUpdatedAt`.
   */
  const [instantDeMontage] = useState(() => Date.now());
  const maintenant = delegationsQuery.dataUpdatedAt || instantDeMontage;

  const delegations = useMemo(
    () => ordonne(delegationsQuery.data?.data ?? [], maintenant),
    [delegationsQuery.data, maintenant],
  );

  /**
   * Le rôle est affiché par une clé du dictionnaire, jamais par le
   * `role_label` de la ressource — qui est du français en dur écrit dans le
   * PHP (principe non négociable n°5). Le repli sur la valeur brute couvre
   * une délégation portant un rôle sorti du catalogue depuis sa création.
   */
  const libelleRole = (role: string): string => {
    const cle = `roles.${role}`;
    return t.has(cle) ? t(cle) : role;
  };

  const periode = (delegation: RoleDelegation): string => {
    const debut = delegation.starts_at ? formatDate(delegation.starts_at) : null;
    const fin = formatDate(delegation.ends_at);
    return debut ? t('period.range', { start: debut, end: fin }) : t('period.until', { end: fin });
  };

  const nomComplet = (delegation: RoleDelegation): string => {
    const partie = delegation.user;
    if (!partie) return t('unknown_member', { id: delegation.user_id });
    return `${partie.first_name} ${partie.last_name}`.trim();
  };

  return (
    <section className="space-y-4" aria-labelledby="role-delegations-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="role-delegations-heading" className="text-lg font-semibold text-foreground">
            {t('heading')}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
        </div>

        {canDelegate ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-4" aria-hidden="true" />
            {t('actions.create')}
          </Button>
        ) : null}
      </div>

      {delegationsQuery.isLoading ? (
        <Skeleton className="h-40 rounded-xl" data-testid="role-delegations-loading" />
      ) : delegationsQuery.isError ? (
        <ErrorState
          message={messageErreur(delegationsQuery.error, t('errors.load'))}
          onRetry={() => void delegationsQuery.refetch()}
          retryLabel={tCommon('retry')}
        />
      ) : delegations.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.member')}</TableHead>
                <TableHead>{t('columns.role')}</TableHead>
                <TableHead>{t('columns.period')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {delegations.map((delegation) => {
                const statut = statutEffectif(delegation, maintenant);
                return (
                <TableRow
                  key={delegation.id}
                  data-status={statut}
                  className={STATUS_ROW[statut]}
                >
                  <TableCell className="font-medium text-foreground">
                    {nomComplet(delegation)}
                  </TableCell>
                  <TableCell>{libelleRole(delegation.role)}</TableCell>
                  <TableCell className="whitespace-nowrap">{periode(delegation)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_BADGE[statut]}
                      data-testid={`delegation-status-${statut}`}
                    >
                      {t(`statuses.${statut}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canDelegate && estDelegationRevocable(statut) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        // Le nom passe par l'étiquette accessible et non par
                        // le libellé visible : quatre boutons « Révoquer »
                        // empilés sont indiscernables pour un lecteur d'écran
                        // qui parcourt les commandes hors contexte.
                        aria-label={t('actions.revoke_named', { name: nomComplet(delegation) })}
                        onClick={() => setPendingRevoke(delegation)}
                      >
                        {t('actions.revoke')}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateDelegationDialog
        agencyId={agencyId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <RevokeDelegationDialog
        agencyId={agencyId}
        delegation={pendingRevoke}
        onClose={() => setPendingRevoke(null)}
      />
    </section>
  );
}
