'use client';

import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useState, useTransition, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { accepterInvitationAction } from '@/app/actions/invitations';
import { BoutonCollant } from '@/components/auth/BoutonCollant';
import { DeclarerEntree } from '@/components/entree/CoqueDEntree';

import { BOUTON_D_INVITATION } from './PiecesDeLInvitation';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldDensityScope } from '@/components/ui/field-density';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useCurrentLocale } from '@/i18n/hooks';
import { isTwoFactorChallenge, login } from '@/lib/auth';
import { destinationDInvitation } from '@/lib/invitation-destination';
import type { NomsPreremplis } from '@/lib/invitation-prerempli';
import { avecRedirection } from '@/lib/redirection-interne';
import { hrefConnexionPour } from '@/components/auth/lien-connexion';
import { cn } from '@/lib/utils';

/**
 * `profilesKeys.all` de `useProfiles`, redéclarée comme dans `credits-solde.ts` : importer le hook
 * tirerait ses espaces de libellés (`profile`, `ui`) dans la frontière de cette page.
 */
const CLE_PROFILS = ['me', 'profiles'] as const;

/**
 * TCK-626 — accepter une invitation, connecté ou non.
 *
 * - **Connecté** : un bouton. Le compte courant est rattaché à l'invitation. P220.07 (TCK-2281) —
 *   un compte SANS NOM (créé par téléphone) voit en plus le prénom et le nom de l'invitation
 *   (`prerempli`), qu'il confirme ou corrige ; l'API ne les écrit que sur un compte sans nom.
 * - **Déconnecté** : prénom, nom, mot de passe — le compte naît de l'invitation, puis la session
 *   s'ouvre avec ce mot de passe. « J'ai déjà un compte » passe par la connexion, qui ramène ici.
 *
 * Dans les deux cas, on finit dans l'assistant du profil que l'invitation active.
 *
 * TCK-2611 — la page d'invitation (`EntreeDInvitation`) monte ce composant pour ses deux voies sans
 * code : la voie mot de passe, repliée derrière « Utiliser un mot de passe » (l'œil compris), et le
 * compte connecté (« Rejoindre Dakar Immo », collé au-dessus du clavier, « Ce n'est pas moi » sous le
 * bouton). Ses props facultatives n'en changent que les libellés et la place du bouton : les appels,
 * les destinations et la connexion restent ceux de TCK-626.
 */
interface AccepterInvitationProps {
  readonly jeton: string;
  readonly connecte: boolean;
  readonly prerempli?: NomsPreremplis | null;
  /** Le libellé du geste connecté (« Rejoindre Dakar Immo ») ; défaut « Accepter l'invitation ». */
  readonly libelleAccepter?: string;
  /** Le texte au-dessus des noms d'un compte connecté sans nom ; défaut `confirmName`. */
  readonly aideDuNom?: string;
  /** Sous le bouton, dans la même barre (« Ce n'est pas moi — changer de compte »). */
  readonly apres?: ReactNode;
  /** Le bouton collé au-dessus du clavier au téléphone (`BoutonCollant`). */
  readonly collant?: boolean;
  /** Voie mot de passe : un lien de plus à côté de « J'ai déjà un compte » (« Recevoir plutôt un code »). */
  readonly autreVoie?: ReactNode;
  /** TCK-2611 — refus 403 (le compte connecté n'est pas le destinataire) : « Changer de compte ». */
  readonly onChangerDeCompte?: () => void;
}

export function AccepterInvitation({
  jeton,
  connecte,
  prerempli = null,
  libelleAccepter,
  aideDuNom,
  apres = null,
  collant = false,
  autreVoie = null,
  onChangerDeCompte,
}: AccepterInvitationProps) {
  const t = useTranslations('invitationAccept');
  const router = useRouter();
  const locale = useCurrentLocale();
  const { openSession, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [prenom, setPrenom] = useState(prerempli?.prenom ?? '');
  const [nom, setNom] = useState(prerempli?.nom ?? '');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [aConnecter, setAConnecter] = useState(false);
  const [aChanger, setAChanger] = useState(false);
  const [visible, setVisible] = useState(false);
  const [enCours, demarrer] = useTransition();
  const decalage = useDecalageDuClavier();

  // TCK-2598 (r2) — rien n'est enregistré avant l'envoi : un mot de passe tapé, des noms corrigés
  // (comparés au pré-rempli, pas au vide) sont une saisie, et la sortie de la coque demande.
  const saisie = motDePasse !== '' || prenom !== (prerempli?.prenom ?? '') || nom !== (prerempli?.nom ?? '');
  const declaration = <DeclarerEntree saisie={saisie || undefined} reprise={t('sortie.reprise')} />;

  const ici = `/invitations/accept?token=${encodeURIComponent(jeton)}`;
  // TCK-2604 — l'action interrompue suit : la connexion dit « Votre invitation ».
  const lienConnexion = hrefConnexionPour(ici, 'invitation');

  function accepter(champs?: { first_name: string; last_name: string; password?: string }) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await accepterInvitationAction(jeton, champs);
      if (!resultat.ok) {
        setErreur(resultat.message);
        setAConnecter(resultat.seConnecter);
        setAChanger(!resultat.seConnecter && resultat.changerDeCompte === true);
        return;
      }
      const destination = destinationDInvitation(resultat.invitation.role, resultat.invitation.invitable_id);
      if (connecte) {
        // TCK-2042 (P202.04) — l'invitation ajoute un profil au compte : comme les assistants qui en
        // créent un, on relit l'utilisateur (ses `roles`) et la liste des profils avant de partir.
        await refreshUser();
        await queryClient.invalidateQueries({ queryKey: CLE_PROFILS });
        router.push(destination);
        return;
      }
      // Le compte vient de naître avec ce mot de passe : on ouvre la session. Une invitation par
      // SMS ne porte pas d'e-mail — la connexion par téléphone prend le relais.
      const email = resultat.invitation.email;
      if (email && champs?.password) {
        try {
          const session = await login({ email, password: champs.password }, locale);
          if (!isTwoFactorChallenge(session)) {
            await openSession(session.token, session.user, session.expires_at);
            router.push(destination);
            return;
          }
        } catch {
          // la connexion explicite ci-dessous reste possible
        }
      }
      router.push(avecRedirection('/auth/login', destination));
    });
  }

  function envoyer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (prenom.trim() === '' || motDePasse === '') {
      setErreur(t('required'));
      return;
    }
    accepter({ first_name: prenom.trim(), last_name: nom.trim(), password: motDePasse });
  }

  const alerte = erreur ? (
    <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
      <p>{erreur}</p>
      {aConnecter ? (
        <Link href={lienConnexion} className="font-medium text-primary underline-offset-4 hover:underline">
          {t('signIn')}
        </Link>
      ) : null}
      {aChanger && onChangerDeCompte ? (
        <button type="button" onClick={onChangerDeCompte} className="w-fit font-medium text-primary underline-offset-4 hover:underline">
          {t('connecte.changer')}
        </button>
      ) : null}
    </div>
  ) : null;

  const libelleDuGeste = libelleAccepter ?? t('accept');
  /** Le geste connecté : dans le flux, ou collé au-dessus du clavier avec ce qui le suit. */
  function geste(bouton: ReactNode) {
    if (!collant) return bouton;
    return (
      <>
        {/* Clavier fermé, le pied garde le retrait bas de la maquette de l'invitation (16 px) ; ouvert, celui de la famille. */}
        <BoutonCollant decalage={decalage} className={cn('max-lg:mt-6 lg:mt-5', decalage > 0 ? null : 'max-lg:pb-4')}>
          {bouton}
          {apres}
        </BoutonCollant>
        {apres ? <div aria-hidden="true" className="h-11 flex-none lg:hidden" /> : null}
      </>
    );
  }

  const champsDuNom = (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invitation-prenom">{t('firstName')}</Label>
        <Input id="invitation-prenom" autoComplete="given-name" maxLength={100} value={prenom}
          onChange={(e) => setPrenom(e.target.value)} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invitation-nom">{t('lastName')}</Label>
        <Input id="invitation-nom" autoComplete="family-name" maxLength={100} value={nom}
          onChange={(e) => setNom(e.target.value)} disabled={enCours} />
      </div>
    </div>
  );

  if (connecte && prerempli) {
    // Un prénom effacé n'empêche pas d'accepter : le compte reste alors sans nom, comme avant.
    return (
      <form
        {...fieldDensityScope()}
        onSubmit={(event) => {
          event.preventDefault();
          accepter({ first_name: prenom.trim(), last_name: nom.trim() });
        }}
        noValidate
        className="flex flex-col gap-5"
      >
        {declaration}
        <p className="text-sm text-muted-foreground">{aideDuNom ?? t('confirmName')}</p>
        {champsDuNom}
        {alerte}
        {geste(
          <Button type="submit" size="lg" className={collant ? BOUTON_D_INVITATION : 'h-11 px-6 sm:self-start'} disabled={enCours}>
            {enCours ? t('accepting') : libelleDuGeste}
          </Button>,
        )}
        {collant ? null : apres}
      </form>
    );
  }

  if (connecte) {
    return (
      <div className="flex flex-col gap-4">
        {alerte}
        {geste(
          <Button type="button" size="lg" className={collant ? BOUTON_D_INVITATION : 'h-11 px-6 sm:self-start'} disabled={enCours} onClick={() => accepter()}>
            {enCours ? t('accepting') : libelleDuGeste}
          </Button>,
        )}
        {collant ? null : apres}
      </div>
    );
  }

  return (
    <form {...fieldDensityScope()} onSubmit={envoyer} noValidate className="flex flex-col gap-5">
      {declaration}
      {champsDuNom}
      <div className="flex flex-col gap-2">
        <Label htmlFor="invitation-mot-de-passe">{t('password')}</Label>
        {/* TCK-2611 — l'œil : le mot de passe se relit avant d'être envoyé (« avec l'œil », ticket). */}
        <div className="relative">
          <Input id="invitation-mot-de-passe" type={visible ? 'text' : 'password'} autoComplete="new-password" maxLength={72}
            value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} disabled={enCours}
            aria-describedby="invitation-mot-de-passe-aide" className="pr-11" />
          <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}
            aria-label={visible ? t('motDePasse.masquer') : t('motDePasse.afficher')}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring">
            {visible ? <EyeOff className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" /> : <Eye className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
        <p id="invitation-mot-de-passe-aide" className="text-xs text-muted-foreground">{t('passwordHint')}</p>
      </div>
      {alerte}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-6">
        <Button type="submit" size="lg" className="h-11 px-6" disabled={enCours}>
          {enCours ? t('accepting') : t('create')}
        </Button>
        <Link href={lienConnexion}
          className="flex min-h-11 items-center justify-center rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t('haveAccount')}
        </Link>
        {autreVoie}
      </div>
    </form>
  );
}
