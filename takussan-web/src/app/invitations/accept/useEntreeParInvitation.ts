'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LONGUEUR_DU_CODE } from '@/components/auth/CasesDuCode';
import { useAuth } from '@/context/AuthContext';
import { useCurrentLocale } from '@/i18n/hooks';
import { ApiError } from '@/lib/api';
import { exigeConditions, exigeDoubleFacteur } from '@/lib/connexion-telephone';
import { destinationDInvitation } from '@/lib/invitation-destination';
import { demanderCodeDInvitation, verifierCodeDInvitation, type ReponseDeVerification } from '@/lib/invitation-code';

/**
 * TCK-2611 (ADR-0094 § 5) — l'automate de l'entrée par code d'une invitation : le numéro (saisi pour
 * une invitation par e-mail, celui de l'invitation par SMS), le code, les conditions d'un compte né
 * du Radar (TCK-2404), le second facteur — puis la session ouverte et l'assistant du rôle.
 *
 * ⚠ **Le modèle est `useEntreeParTelephone`, pas son import** : ce hook lit l'espace `auth`, que la
 * frontière de dictionnaire de `/invitations` ne sert pas (TCK-337, plafond de 10 %). Mêmes gardes :
 * une vérification à la fois (référence), un code refusé laisse les six cases en rouge.
 *
 * ⚠ **Le code est consommé même quand l'acceptation est ensuite refusée** (401, 403, 409, 410 —
 * relevé de TCK-2610) : après l'un d'eux, l'écran revient au numéro et redemande un code. Un 410
 * (l'invitation s'est fermée entre-temps) relit la page : le serveur rend alors l'écran fermé.
 */
export type EtapeDInvitation = 'numero' | 'code' | 'conditions' | 'double-facteur';

interface Options {
  readonly jeton: string;
  /** Invitation par SMS : le code part au numéro de l'invitation, et aucun `phone` ne part. */
  readonly parSms: boolean;
  /** Prénom et nom confirmés par l'invité ; l'API ne les écrit que sur un compte sans nom. */
  readonly noms: () => { readonly prenom: string; readonly nom: string };
  /** Drapeau éteint entre l'affichage et l'envoi (404) : la voie mot de passe reste la seule. */
  readonly onMotDePasse: () => void;
}

/** Le refus qui demande de se connecter à un AUTRE compte : son adresse masquée, s'il y en a une. */
export interface ConnexionDemandee {
  readonly emailMasque: string | null;
}

const corps = (err: ApiError): { code?: unknown; email?: unknown; requires_login?: unknown } =>
  err.data && typeof err.data === 'object' ? (err.data as { code?: unknown; email?: unknown; requires_login?: unknown }) : {};

export function useEntreeParInvitation({ jeton, parSms, noms, onMotDePasse }: Options) {
  const t = useTranslations('invitationAccept.errors');
  const router = useRouter();
  const locale = useCurrentLocale();
  const { openSession } = useAuth();

  const [etape, setEtape] = useState<EtapeDInvitation>('numero');
  const [telephone, setTelephone] = useState('');
  const [code, setCode] = useState('');
  const [secondFacteur, setSecondFacteur] = useState('');
  const [codeDeSecours, setCodeDeSecours] = useState(false);
  const [attente, setAttente] = useState(0);
  const [apercu, setApercu] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [connexionDemandee, setConnexionDemandee] = useState<ConnexionDemandee | null>(null);
  const [versionPresentee, setVersionPresentee] = useState<string | null>(null);
  const [caseConditions, setCaseConditions] = useState(false);
  const [versionAcceptee, setVersionAcceptee] = useState<string | null>(null);
  const [codeRefuse, setCodeRefuse] = useState(false);
  const verificationEnCours = useRef(false);

  // Compte à rebours du renvoi : `retry_after` est la seule source.
  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = window.setTimeout(() => setAttente((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(minuterie);
  }, [attente]);

  function messageDemande(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 429) return t('tropDeDemandes');
      if (err.status === 422) return t('numeroInvalide');
    }
    return t('echec');
  }

  async function envoyerCode(): Promise<void> {
    setEnvoi(true);
    setErreur(null);
    setConnexionDemandee(null);
    try {
      const demande = await demanderCodeDInvitation(jeton, parSms ? null : telephone, locale);
      setAttente(demande.attente);
      setApercu(demande.codeApercu);
      setCode('');
      setCodeRefuse(false);
      setEtape('code');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && corps(err).code !== 'invitation.token_not_found') {
        // Drapeau éteint entre l'affichage et l'envoi : la voie mot de passe reste.
        onMotDePasse();
        return;
      }
      if (err instanceof ApiError && (err.status === 410 || err.status === 404)) {
        router.refresh();
        return;
      }
      setErreur(messageDemande(err));
    } finally {
      setEnvoi(false);
    }
  }

  /** Le code a servi sans que l'invitation soit acceptée : retour au numéro, un nouveau code sera demandé. */
  function codeConsomme(message: string): void {
    setCode('');
    setCodeRefuse(false);
    setVersionAcceptee(null);
    setSecondFacteur('');
    setEtape('numero');
    setErreur(message);
  }

  async function verifier(avecSecondFacteur: boolean, conditions: string | null = versionAcceptee, codeSaisi: string = code): Promise<void> {
    if (verificationEnCours.current) return;
    verificationEnCours.current = true;
    setEnvoi(true);
    setErreur(null);
    setConnexionDemandee(null);
    const { prenom, nom } = noms();
    try {
      const reponse: ReponseDeVerification = await verifierCodeDInvitation(
        jeton,
        {
          code: codeSaisi,
          ...(parSms ? {} : { phone: telephone }),
          ...(prenom.trim() ? { first_name: prenom.trim() } : {}),
          ...(nom.trim() ? { last_name: nom.trim() } : {}),
          ...(conditions ? { terms_version: conditions } : {}),
          ...(avecSecondFacteur ? (codeDeSecours ? { recovery_code: secondFacteur } : { two_factor_code: secondFacteur }) : {}),
        },
        locale,
      );
      if (exigeConditions(reponse)) {
        setVersionPresentee(reponse.terms_version);
        setVersionAcceptee(null);
        setCaseConditions(false);
        setEtape('conditions');
        return;
      }
      if (exigeDoubleFacteur(reponse)) {
        if (avecSecondFacteur) setErreur(t('secondFacteurInvalide'));
        setEtape('double-facteur');
        return;
      }
      await openSession(reponse.token, reponse.user, reponse.expires_at);
      router.push(destinationDInvitation(reponse.invitation.role, reponse.invitation.invitable_id));
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setErreur(t('echec'));
        return;
      }
      const { code: codeErreur, email, requires_login: connexion } = corps(err);
      if (err.status === 401 && connexion === true) {
        // TCK-2727 — l'adresse est déjà MASQUÉE par l'API ; elle dit à quel compte se connecter, rien de plus.
        setConnexionDemandee({ emailMasque: typeof email === 'string' ? email : null });
        codeConsomme(typeof email === 'string' ? t('autreCompte', { email }) : t('autreCompteSans'));
        return;
      }
      if (err.status === 410) {
        router.refresh();
        codeConsomme(t('fermee'));
        return;
      }
      if (err.status === 403 || err.status === 409) {
        codeConsomme(err.status === 403 ? t('mauvaisCompte') : t('fermee'));
        return;
      }
      if (err.status === 423 || codeErreur === 'account_locked') setErreur(t('verrouille'));
      else if (codeErreur === 'account_blocked') setErreur(t('bloque'));
      else if (err.status === 429) setErreur(t('tropDeDemandes'));
      else if (err.status === 422) {
        // Un code expiré pendant la lecture des conditions : retour aux six cases, vidées, où se trouve le renvoi.
        if (etape === 'conditions') {
          setCode('');
          setEtape('code');
        } else if (etape === 'code') setCodeRefuse(true);
        setErreur(t('codeInvalide'));
      } else setErreur(t('echec'));
    } finally {
      verificationEnCours.current = false;
      setEnvoi(false);
    }
  }

  /** La frappe dans les six cases — et l'envoi au sixième chiffre, une fois. */
  function saisirCode(valeur: string): void {
    if (verificationEnCours.current) return;
    const avant = code;
    setCode(valeur);
    setCodeRefuse(false);
    if (valeur.length === LONGUEUR_DU_CODE && avant !== valeur) void verifier(false, versionAcceptee, valeur);
  }

  function revenirAuNumero(): void {
    setEtape('numero');
    setCode('');
    setCodeRefuse(false);
    setErreur(null);
    setVersionAcceptee(null);
  }

  function accepterConditions(): void {
    if (!caseConditions || !versionPresentee) return;
    setVersionAcceptee(versionPresentee);
    void verifier(false, versionPresentee);
  }

  function basculerCodeDeSecours(): void {
    setCodeDeSecours((v) => !v);
    setSecondFacteur('');
    setErreur(null);
  }

  return {
    etape,
    telephone,
    setTelephone,
    code,
    saisirCode,
    codeRefuse,
    secondFacteur,
    setSecondFacteur,
    codeDeSecours,
    basculerCodeDeSecours,
    attente,
    apercu,
    envoi,
    erreur,
    connexionDemandee,
    caseConditions,
    setCaseConditions,
    envoyerCode,
    verifier,
    accepterConditions,
    revenirAuNumero,
  };
}

export type EntreeParInvitation = ReturnType<typeof useEntreeParInvitation>;
