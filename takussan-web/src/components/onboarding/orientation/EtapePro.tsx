'use client';

import { useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { BadgeCheck, Check, ClipboardPaste, FileSignature, House, Megaphone, ShieldCheck, Wallet } from 'lucide-react';

import { hostIndividualOnboardAction } from '@/app/actions/onboarding';
import { phoneSendOtpAction, phoneVerifyOtpAction } from '@/app/actions/security';
import { BOUTON_D_ENTREE } from '@/components/auth/BoutonCollant';
import { CasesDuCode, LONGUEUR_DU_CODE } from '@/components/auth/CasesDuCode';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { TitreDEntree } from '@/components/auth/PiecesDuCourriel';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import { marquerArriveeDeParcours } from '@/lib/arrivee-de-parcours';
import { lireInvitation, type ApercuDInvitation } from '@/lib/invitation-apercu';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { lienDInvitationSuivi } from '@/lib/orientation';
import { numeroComposable } from '@/lib/phone';
import { cn } from '@/lib/utils';

import { DeclarerBarreDOrientation } from './BarreDOrientation';

/** Ce que la page sait du compte et du site, lu par le serveur. */
export interface CompteDuPro {
  /** Le numéro du compte, en E.164 ; `null` sans numéro. */
  readonly telephone: string | null;
  readonly telephoneVerifie: boolean;
  /** `SITE_URL` (serveur seulement) : un lien d'invitation de la préproduction est de Takussan. */
  readonly origineDuSite: string;
  /** `invitationAccept.roles` : le rôle que l'agence propose, en mots. */
  readonly roles: Readonly<Record<string, string>>;
}

type Choix = 'creer' | 'rejoindre';

const ID_FORMULAIRE = 'orientation-pro';
/** Les libellés des maquettes a-3 et a-4 : à la largeur de leur texte, sur l'interligne de 20 px du texte `sm`. */
const LIBELLE = 'self-start leading-(--text-sm--line-height)';

/**
 * TCK-2608 — « Votre agence sur Takussan » : créer son espace, ou rejoindre une agence.
 *
 * **Créer** ouvre un espace INDIVIDUEL (`POST /api/host/individual/onboard`, comme l'assistant hôte), puis
 * la demande de passage en agence, pré-remplie du nom saisi (`raison_sociale`, AC3) : c'est elle que
 * Takussan vérifie. ⚠ **L'écran ne promet ni équipe ni délai** (AC3) : un espace individuel n'a pas
 * d'équipe (features § 1.12), et aucun mécanisme ne tient « sous 48 h ».
 *
 * Le numéro : l'API exige celui du compte (`phone_mismatch` sinon). Vérifié, il est REPRIS ; sinon il se
 * vérifie ici, par SMS, avant la création.
 *
 * **Rejoindre** : un lien collé n'est suivi que s'il est une URL `/invitations/accept?token=…` de
 * Takussan (`lienDInvitationSuivi`) ; l'agence qui invite est lue (`GET`, lecture seule — ADR-0094), puis
 * la page d'invitation s'ouvre. Rien n'est accepté ici.
 */
export function EtapePro({ marque, compte, onRetour }: { readonly marque: string; readonly compte: CompteDuPro; readonly onRetour: () => void }) {
  const t = useTranslations('onboarding.orientation.pro');
  const tO = useTranslations('onboarding.orientation');
  const router = useRouter();
  const { refreshUser } = useAuth();
  const id = useId();
  const [choix, setChoix] = useState<Choix>('creer');

  // Créer
  const [nom, setNom] = useState('');
  const [ville, setVille] = useState('Dakar');
  const [telephone, setTelephone] = useState(compte.telephone ?? '');
  const [verifie, setVerifie] = useState(compte.telephoneVerifie);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nomManquant, setNomManquant] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // Rejoindre
  const [lien, setLien] = useState('');
  const [chemin, setChemin] = useState<string | null>(null);
  const jeton = chemin ? new URLSearchParams(chemin.split('?')[1]).get('token') : null;
  const lecture = useQuery({
    queryKey: ['orientation', 'invitation', jeton],
    queryFn: () => lireInvitation(jeton ?? ''),
    enabled: jeton !== null,
    retry: false,
    staleTime: Infinity,
  });

  function surLien(valeur: string) {
    setLien(valeur);
    setChemin(lienDInvitationSuivi(valeur, compte.origineDuSite, window.location.origin));
  }

  async function coller() {
    try {
      surLien(await navigator.clipboard.readText());
    } catch {
      document.getElementById(`${id}-lien`)?.focus();
    }
  }

  async function creer() {
    setErreur(null);
    if (nom.trim() === '') {
      setNomManquant(true);
      document.getElementById(`${id}-nom`)?.focus();
      return;
    }
    if (!verifie) return;
    setEnCours(true);
    const resultat = await hostIndividualOnboardAction({
      agency: { name: nom.trim(), primary_city: ville.trim() || 'Dakar', currency: 'XOF' },
      // Le numéro vérifié du compte : l'API n'exige le code que d'un numéro non vérifié.
      phone_otp: { phone: telephone, code: '' },
      cgu_accepted: true,
    });
    // Le compte qui a déjà un espace va directement à la demande : l'API le dit
    // par un 409 (`already_onboarded`, `HostIndividualOnboardingService`).
    const dejaUnEspace = !resultat.ok && resultat.status === 409;
    if (!resultat.ok && !dejaUnEspace) {
      setErreur(resultat.message || t('erreur'));
      setEnCours(false);
      return;
    }
    await refreshUser();
    // TCK-2615 — l'arrivée qui suit un parcours n'ouvre aucune fenêtre de bienvenue.
    marquerArriveeDeParcours('assistant');
    router.push(`/app/settings/agency/upgrade?raison_sociale=${encodeURIComponent(nom.trim())}`);
  }

  const apercu = lecture.data?.issue === 'valide' ? lecture.data.apercu : null;
  const ferme = lecture.data?.issue === 'fermee' || lecture.data?.issue === 'inconnue';
  const lienRefuse = lien.trim() !== '' && chemin === null;
  const peutRejoindre = chemin !== null && !ferme && !lecture.isFetching;

  const bouton =
    choix === 'creer' ? (
      <Button type="button" onClick={() => void creer()} disabled={enCours || !verifie} aria-busy={enCours || undefined} className={BOUTON_D_ENTREE}>
        {t('creerBouton')}
      </Button>
    ) : (
      <Button type="button" onClick={() => chemin && router.push(chemin)} disabled={!peutRejoindre} className={BOUTON_D_ENTREE}>
        {apercu?.agence ? t('lien.rejoindre', { agence: apercu.agence.nom }) : t('lien.rejoindreSans')}
      </Button>
    );

  return (
    <div>
      <DeclarerBarreDOrientation
        marque={marque}
        titre={t('barre')}
        largeur="volets"
        objet={<CeQueVousAurez />}
        retour={{ libelle: tO('retour'), onClick: onRetour }}
        pied={<div className="lg:hidden">{bouton}</div>}
      />
      <TitreDEntree sous={t('sous')}>{t('titre')}</TitreDEntree>

      <div role="radiogroup" aria-label={t('choix')} className="mt-6 grid gap-2.5 lg:mt-8 lg:grid-cols-2">
        {(['creer', 'rejoindre'] as const).map((c) => {
          const actif = choix === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={actif}
              onClick={() => setChoix(c)}
              className={cn(
                'flex min-h-16 items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
                actif ? 'border-primary ring-3 ring-primary/12' : 'border-border',
              )}
            >
              <span className={cn('inline-flex size-5 flex-none items-center justify-center rounded-full border', actif ? 'border-primary' : 'border-input')}>
                {actif ? <span className="size-2.5 rounded-full bg-primary" /> : null}
              </span>
              <span className="min-w-0 leading-snug">
                <span className="block text-corps font-semibold">{t(`${c}.titre`)}</span>
                <span className="block text-ui text-muted-foreground">{t(`${c}.sous`)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {choix === 'creer' ? (
        <form
          id={ID_FORMULAIRE}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void creer();
          }}
          className="mt-6 lg:mt-7"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <Label htmlFor={`${id}-nom`} className={LIBELLE}>
                {t('nom')} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id={`${id}-nom`}
                required
                maxLength={160}
                autoComplete="organization"
                value={nom}
                aria-invalid={nomManquant || undefined}
                aria-describedby={nomManquant ? `${id}-nom-erreur` : undefined}
                onChange={(e) => {
                  setNom(e.target.value);
                  if (e.target.value.trim() !== '') setNomManquant(false);
                }}
              />
              {nomManquant ? (
                <p id={`${id}-nom-erreur`} className="text-sm text-destructive">
                  {t('nomRequis')}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-ville`} className={LIBELLE}>{t('ville')}</Label>
              <Input id={`${id}-ville`} maxLength={120} autoComplete="address-level2" value={ville} onChange={(e) => setVille(e.target.value)} />
            </div>
            {verifie ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-telephone`} className={LIBELLE}>{t('telephone')}</Label>
                <PhoneInput id={`${id}-telephone`} value={telephone} onValueChange={() => undefined} disabled aide={t('telephoneAide')} />
              </div>
            ) : null}
          </div>
          {verifie ? null : (
            <NumeroAVerifier
              id={`${id}-numero`}
              numero={telephone}
              onNumero={setTelephone}
              onVerifie={() => {
                setVerifie(true);
                void refreshUser();
              }}
            />
          )}

          <EnDeuxTemps className="mt-6" />

          {erreur ? (
            <p role="alert" className="mt-5 text-sm text-destructive">
              {erreur}
            </p>
          ) : null}

          <p className="mt-5 text-ui leading-snug text-muted-foreground">
            {t.rich('cgu', {
              lien: (morceau: ReactNode) => (
                <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="font-medium text-foreground underline underline-offset-4">
                  {morceau}
                </LienLocalise>
              ),
            })}
          </p>
        </form>
      ) : (
        <div className="mt-6 lg:mt-7">
          <p className="text-corps font-semibold">{t('lien.titre')}</p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{t('lien.texte')}</p>
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor={`${id}-lien`} className={LIBELLE}>{t('lien.libelle')}</Label>
            <div className="relative">
              <Input
                id={`${id}-lien`}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={lien}
                onChange={(e) => surLien(e.target.value)}
                aria-invalid={lienRefuse || undefined}
                aria-describedby={lienRefuse ? `${id}-lien-erreur` : undefined}
                className="pr-24"
              />
              <button
                type="button"
                onClick={() => void coller()}
                className="absolute inset-y-0 right-1 my-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                <ClipboardPaste className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('lien.coller')}
              </button>
            </div>
            {lienRefuse ? (
              <p id={`${id}-lien-erreur`} className="text-sm text-destructive">
                {t('lien.refuse')}
              </p>
            ) : null}
          </div>
          <div aria-live="polite">
            {apercu ? <AgenceQuiInvite apercu={apercu} roles={compte.roles} /> : null}
            {ferme ? <p className="mt-3 text-sm text-destructive">{t('lien.ferme')}</p> : null}
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            {t('lien.pasEncore')}{' '}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(t('lien.messageWhatsapp'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('lien.whatsapp')}
            </a>
          </p>
        </div>
      )}

      <div className="mt-8 hidden lg:block [&>button]:w-auto [&>button]:min-w-[16.25rem]">{bouton}</div>
    </div>
  );
}

function AgenceQuiInvite({ apercu, roles }: { readonly apercu: ApercuDInvitation; readonly roles: Readonly<Record<string, string>> }) {
  const t = useTranslations('onboarding.orientation.pro.lien');
  const format = useFormatter();
  const nom = apercu.agence?.nom ?? null;
  const role = roles[apercu.role] ?? roles.autre ?? apercu.role;
  const initiales = (nom ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join('');
  const date = apercu.inviteeLe ? format.dateTime(new Date(apercu.inviteeLe), { day: 'numeric', month: 'short' }) : null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-success/35 bg-success/[0.07] p-3">
      {apercu.agence?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo de 40 px servi tel quel par l'API
        <img src={apercu.agence.logo} alt="" className="size-10 flex-none rounded-lg bg-card object-cover" />
      ) : (
        <span aria-hidden="true" className="inline-flex size-10 flex-none items-center justify-center rounded-lg bg-card font-display text-sm font-semibold">
          {initiales}
        </span>
      )}
      <div className="min-w-0 flex-1 leading-snug">
        {nom ? <p className="text-corps font-semibold">{nom}</p> : null}
        <p className="text-ui text-muted-foreground">
          {t('inviteSansDate', { role })}
          {date ? ` · ${t('envoyee', { invitant: apercu.invitant ?? 'aucun', date })}` : null}
        </p>
      </div>
      <Check className="size-5 flex-none text-success" strokeWidth={2} aria-hidden="true" />
    </div>
  );
}

/** « En deux temps » : ce qui s'ouvre maintenant, ce que Takussan vérifie ensuite — sans délai promis. */
function EnDeuxTemps({ className }: { readonly className?: string }) {
  const t = useTranslations('onboarding.orientation.pro.deuxTemps');
  const temps = [
    { quand: t('maintenant'), quoi: t('maintenantTexte') },
    { quand: t('ensuite'), quoi: t('ensuiteTexte') },
  ];
  return (
    <div className={cn('rounded-xl border border-border bg-muted p-3.5', className)}>
      <p className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <ShieldCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
        {t('titre')}
      </p>
      <ol className="mt-3 space-y-2.5">
        {temps.map((x, i) => (
          <li key={x.quand} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                'mt-px inline-flex size-5 flex-none items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums',
                i === 0 ? 'bg-primary text-primary-foreground' : 'bg-border text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            <span className="text-sm leading-snug">
              <span className="font-semibold">{x.quand}.</span> {x.quoi}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const AVANTAGES = [
  { id: 'biens', icone: House },
  { id: 'baux', icone: FileSignature },
  { id: 'encaissements', icone: Wallet },
  { id: 'credits', icone: Megaphone },
] as const;

/** L'objet du bureau : ce que l'espace donne, et rien qu'un espace individuel ne tienne (pas d'équipe). */
function CeQueVousAurez() {
  const t = useTranslations('onboarding.orientation.pro');
  return (
    <div className="rounded-2xl border border-border bg-muted p-6">
      <p className="font-display text-[1.25rem] font-semibold leading-normal tracking-titre">{t('ceQueVousAurez')}</p>
      <ul className="mt-5 space-y-4">
        {AVANTAGES.map((a) => {
          const I = a.icone;
          return (
            <li key={a.id} className="flex items-start gap-3">
              <I className="mt-0.5 size-5 flex-none text-primary" strokeWidth={1.5} aria-hidden="true" />
              <span className="leading-snug">
                <span className="block text-corps font-semibold">{t(`avantages.${a.id}.titre`)}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{t(`avantages.${a.id}.texte`)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Le numéro du compte n'est pas vérifié : il se vérifie ici. `send-otp` enregistre le numéro TAPÉ sur le
 * compte (TCK-566) — c'est lui que l'API comparera à la création (`phone_otp.phone`).
 */
function NumeroAVerifier({ id, numero, onNumero, onVerifie }: { readonly id: string; readonly numero: string; readonly onNumero: (n: string) => void; readonly onVerifie: () => void }) {
  const t = useTranslations('onboarding.orientation.pro.numero');
  const [envoye, setEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [verification, setVerification] = useState(false);
  const [code, setCode] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    if (!numeroComposable(numero)) return;
    setErreur(null);
    setEnvoi(true);
    const res = await phoneSendOtpAction(numero);
    setEnvoi(false);
    if (!res.ok) {
      setErreur(res.message);
      return;
    }
    setEnvoye(true);
    setApercu(res.data?.codeApercu ?? null);
  }

  async function verifier(valeur = code) {
    if (valeur.length !== LONGUEUR_DU_CODE) return;
    setErreur(null);
    setVerification(true);
    const res = await phoneVerifyOtpAction(valeur);
    setVerification(false);
    if (!res.ok) {
      setErreur(res.message);
      return;
    }
    onVerifie();
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-3.5">
      <div className="flex items-start gap-2">
        <BadgeCheck className="mt-0.5 size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm leading-snug text-muted-foreground">{t('aide')}</p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-telephone`} className={LIBELLE}>{t('libelle')}</Label>
          <PhoneInput id={`${id}-telephone`} value={numero} onValueChange={onNumero} disabled={envoye} aide={false} />
        </div>
        <Button type="button" variant="outline" className="h-11 px-4" onClick={() => void envoyer()} disabled={envoi || envoye || !numeroComposable(numero)}>
          {t('envoyer')}
        </Button>
      </div>
      {envoye ? (
        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor={`${id}-code`} className={LIBELLE}>{t('code')}</Label>
          <CasesDuCode
            id={`${id}-code`}
            valeur={code}
            onChange={(v) => {
              setCode(v);
              if (v.length === LONGUEUR_DU_CODE) void verifier(v);
            }}
            erreur={erreur !== null}
            desactive={verification}
          />
          <CodeDePreproduction code={apercu} onUtiliser={(c) => {
            setCode(c);
            void verifier(c);
          }} forme="ligne" />
        </div>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
