'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { useCreateRoleDelegation, useDelegationCandidates } from '@/lib/queries/role-delegations';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { DELEGABLE_ROLES, type DelegableRole } from '@/types/role-delegation';

/**
 * Miroir de `config('role_delegations.max_duration_days')`. Sert **d'indice
 * de saisie** (`max=` sur le champ), pas de garde : le refus appartient à
 * `StoreRoleDelegationRequest`, qui rend 422
 * (`role_delegations.validation.max_duration`) et que ce dialogue affiche.
 *
 * ⚠️ Le ticket parlait de « douze mois ». La config dit **366 jours** — un an
 * bissextile, pas douze mois calendaires. C'est 366 qui est appliqué.
 */
const DUREE_MAX_JOURS = 366;

/** `YYYY-MM-DD` — la forme qu'un `<input type="date">` lit et écrit. */
function jourIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Les messages d'un refus 422, **tels que le serveur les écrit**.
 *
 * Laravel renvoie `{message, errors: {champ: [msg, …]}}` et `apiRequest`
 * forwarde `Accept-Language` : cette prose est déjà localisée (les catalogues
 * `lang/{fr,en}/role_delegations.php` existent). La traduire une seconde fois
 * côté front demanderait de dupliquer les cinq règles métier — donc de les
 * faire diverger.
 *
 * On rend **tous** les champs, pas le seul `message` : le `message` de Laravel
 * n'est que la PREMIÈRE erreur, et une soumission peut en violer deux (un
 * bénéficiaire hors agence *et* une durée excessive).
 */
function messagesDeRefus(erreur: unknown): readonly string[] {
  if (!(erreur instanceof ApiError) || erreur.status !== 422) return [];

  // `validationErrors` est l'accesseur canonique d'`ApiError` — il ne rend un
  // objet que sur un 422 portant `errors`.
  const parChamp = erreur.validationErrors;
  if (parChamp) {
    const messages = Object.values(parChamp).flat().filter((m) => typeof m === 'string');
    if (messages.length > 0) return messages;
  }

  // Repli : un 422 sans `errors`. `proseServeur` filtre au passage les
  // sentinelles anglaises du framework, qui ne doivent jamais atteindre
  // l'écran.
  const prose = erreur.proseServeur;
  return prose ? [prose] : [];
}

interface CreateDelegationDialogProps {
  readonly agencyId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * TCK-369 — « qui, quel rôle, jusqu'à quand ». Trois champs obligatoires, un
 * motif facultatif.
 *
 * ## Ce que l'écran prévient, et ce qu'il se contente d'afficher
 *
 * Le ticket est explicite : les refus déjà servis en 422 **ne se
 * réimplémentent pas comme gardes** — la policy décide. Deux d'entre eux se
 * *préviennent* pourtant sans rien réimplémenter, en ne PROPOSANT pas
 * l'impossible :
 *
 *  · **l'auto-délégation** — l'utilisateur courant est retiré de la liste des
 *    bénéficiaires. C'est un retrait d'option, pas un contrôle : rien ici ne
 *    juge une valeur soumise.
 *  · **le bénéficiaire hors agence** — la liste vient de
 *    `/agencies/{id}/members`, dont le contenu est exactement la condition
 *    que le service vérifie (`isAgentAt || isOwnerAt`).
 *
 * Tout le reste — rôle non délégable, durée excessive, administrateur
 * principal — arrive en 422 et s'affiche mot pour mot.
 *
 * ## `<select>` natif, comme `CreateRoleDialog`
 *
 * Cohérence avec l'autre dialogue de cet écran, et un contrôle pilotable au
 * clavier comme par un test sans traverser de portail.
 */
export function CreateDelegationDialog({
  agencyId,
  open,
  onOpenChange,
}: CreateDelegationDialogProps) {
  const t = useTranslations('admin.roles.role_delegations');
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const { user: utilisateurCourant } = useAuth();

  // La liste des membres n'est tirée qu'à l'ouverture : elle ne sert qu'ici,
  // et l'écran des rôles se charge déjà de trois requêtes.
  const candidatsQuery = useDelegationCandidates(agencyId, open);
  const create = useCreateRoleDelegation(agencyId);

  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<DelegableRole>('agent');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');

  /**
   * Le dialogue n'est pas démonté entre deux ouvertures : sans cette remise à
   * zéro, la seconde ouverture rouvrirait le formulaire de la première, motif
   * et refus compris. Ajusté pendant le rendu et non dans un effet — un effet
   * peindrait d'abord l'ancien état, fût-ce une image.
   */
  const [synchroniseSur, setSynchroniseSur] = useState(false);
  if (synchroniseSur !== open) {
    setSynchroniseSur(open);
    if (open) {
      setUserId('');
      setRole('agent');
      setStartsAt('');
      setEndsAt('');
      setReason('');
      create.reset();
    }
  }

  /**
   * L'utilisateur courant est retiré : `StoreRoleDelegationRequest` **et**
   * `RoleDelegationService::create` refusent tous deux l'auto-délégation.
   */
  const candidats = useMemo(() => {
    const membres = candidatsQuery.data?.data ?? [];
    return membres.filter((membre) => membre.id !== utilisateurCourant?.id);
  }, [candidatsQuery.data, utilisateurCourant?.id]);

  const dateMax = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() + DUREE_MAX_JOURS);
    return jourIso(limite);
  }, []);

  const refus = messagesDeRefus(create.error);
  const pannePlusQueRefus = create.error !== null && refus.length === 0;
  const soumissionPossible = userId !== '' && endsAt !== '' && !create.isPending;

  const submit = async () => {
    try {
      await create.mutateAsync({
        user_id: Number(userId),
        role,
        starts_at: startsAt === '' ? null : startsAt,
        ends_at: endsAt,
        reason: reason.trim() === '' ? null : reason.trim(),
      });
      onOpenChange(false);
    } catch {
      // Le refus est déjà porté par `create.error` et rendu ci-dessous. Le
      // dialogue RESTE ouvert : un 422 se corrige dans le formulaire qui l'a
      // produit, et le fermer obligerait à ressaisir les quatre champs.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delegation-user">{t('create.member_label')}</Label>
            <select
              id="delegation-user"
              className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground"
              value={userId}
              disabled={candidatsQuery.isLoading}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">{t('create.member_placeholder')}</option>
              {candidats.map((membre) => (
                <option key={membre.id} value={String(membre.id)}>
                  {`${membre.first_name} ${membre.last_name}`.trim()}
                </option>
              ))}
            </select>
            {!candidatsQuery.isLoading && candidats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('create.no_member')}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="delegation-role">{t('create.role_label')}</Label>
            <select
              id="delegation-role"
              className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground"
              value={role}
              onChange={(e) => setRole(e.target.value as DelegableRole)}
            >
              {DELEGABLE_ROLES.map((valeur) => (
                <option key={valeur} value={valeur}>
                  {t(`roles.${valeur}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="delegation-starts-at">{t('create.starts_at_label')}</Label>
              <Input
                id="delegation-starts-at"
                type="date"
                value={startsAt}
                max={dateMax}
                onChange={(e) => setStartsAt(e.target.value)}
              />
              {/*
                Le champ est facultatif, et son absence n'est pas neutre :
                sans date de début le backend crée la délégation `active`
                immédiatement, pas `scheduled`. L'indice le dit.
              */}
              <p className="text-xs text-muted-foreground">{t('create.starts_at_hint')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delegation-ends-at">{t('create.ends_at_label')}</Label>
              <Input
                id="delegation-ends-at"
                type="date"
                value={endsAt}
                max={dateMax}
                onChange={(e) => setEndsAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('create.max_duration_hint', { days: DUREE_MAX_JOURS })}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delegation-reason">{t('create.reason_label')}</Label>
            <Textarea
              id="delegation-reason"
              rows={2}
              value={reason}
              placeholder={t('create.reason_placeholder')}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {refus.length > 0 ? (
            <ul
              className="space-y-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="delegation-refus"
            >
              {refus.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          {pannePlusQueRefus ? (
            <p className="text-sm text-destructive" role="alert">
              {messageErreur(create.error, t('errors.create'))}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={!soumissionPossible}>
            {create.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {create.isPending ? t('create.submitting') : t('create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
