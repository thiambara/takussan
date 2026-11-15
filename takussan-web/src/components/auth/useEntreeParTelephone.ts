'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useCurrentLocale } from '@/i18n/hooks';
import { ApiError } from '@/lib/api';
import type { AuthResponse } from '@/lib/auth';
import {
  demanderCodeTelephone,
  exigeConditions,
  exigeDoubleFacteur,
  verifierCodeTelephone,
} from '@/lib/connexion-telephone';

import { LONGUEUR_DU_CODE } from './CasesDuCode';

/**
 * TCK-589, extrait de `ConnexionParTelephone` par TCK-2601 — l'automate de l'entrée par numéro
 * (ADR-0033) : le numéro, le code reçu par SMS, les conditions d'un compte né du Radar (TCK-2404), le
 * second facteur. Deux écrans le rendent : la porte de connexion, et la feuille de compte de
 * l'assistant de publication. Les états, les messages et les gardes sont les mêmes : c'est la raison
 * de l'extraction, rien n'a changé dans leur logique.
 *
 * `auSixiemeChiffre` : la porte vérifie le code dès le sixième chiffre (TCK-2604) ; la feuille le
 * vérifie au geste « Publier mon annonce », qui porte aussi le prénom et le nom.
 */
export type EtapeDEntree = 'numero' | 'code' | 'conditions' | 'double-facteur';

interface Options {
  /** Session ouverte ; `true` quand le compte vient d'être créé par ce code, et le compte rendu. */
  readonly onConnecte: (nouveauCompte: boolean, user: AuthResponse['user']) => void | Promise<void>;
  /** Drapeau éteint entre l'affichage et l'envoi (404) : la voie e-mail reste la seule. */
  readonly onEmail: () => void;
  readonly auSixiemeChiffre?: boolean;
}

export function useEntreeParTelephone({ onConnecte, onEmail, auSixiemeChiffre = true }: Options) {
  const t = useTranslations('auth.phoneLogin');
  const t2fa = useTranslations('auth.twoFactorChallenge');
  const locale = useCurrentLocale();
  const { openSession } = useAuth();

  const [etape, setEtape] = useState<EtapeDEntree>('numero');
  const [telephone, setTelephone] = useState('');
  const [code, setCode] = useState('');
  const [secondFacteur, setSecondFacteur] = useState('');
  const [codeDeSecours, setCodeDeSecours] = useState(false);
  const [attente, setAttente] = useState(0);
  const [apercu, setApercu] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // TCK-2404 — la version que l'API présente, la case, et la version acceptée qui suit le code.
  const [versionPresentee, setVersionPresentee] = useState<string | null>(null);
  const [caseConditions, setCaseConditions] = useState(false);
  const [versionAcceptee, setVersionAcceptee] = useState<string | null>(null);
  // TCK-2604 — un code refusé laisse les six cases, en rouge, jusqu'à la frappe suivante.
  const [codeRefuse, setCodeRefuse] = useState(false);
  // TCK-2604 (AC3) — UNE vérification à la fois : le sixième chiffre, « Me connecter » et
  // « Utiliser ce code » ne partent jamais deux fois. Une référence, lue avant le rendu suivant.
  const verificationEnCours = useRef(false);

  // Compte à rebours du renvoi : `retry_after` est la seule source, jamais une durée supposée.
  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = window.setTimeout(() => setAttente((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(minuterie);
  }, [attente]);

  function messageDemande(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 429) return t('tooMany');
      if (err.status === 422) return t('invalidPhone');
    }
    return t('failed');
  }

  function messageVerification(err: unknown): string {
    if (err instanceof ApiError) {
      const codeErreur =
        err.data && typeof err.data === 'object' ? (err.data as { code?: unknown }).code : undefined;
      if (err.status === 423 || codeErreur === 'account_locked') return t('locked');
      if (codeErreur === 'account_blocked') return t('blocked');
      if (err.status === 429) return t('tooMany');
      if (err.status === 422) return t('codeInvalid');
    }
    return t('failed');
  }

  async function envoyerCode(): Promise<void> {
    setEnvoi(true);
    setErreur(null);
    try {
      const demande = await demanderCodeTelephone(telephone, locale);
      setAttente(demande.attente);
      setApercu(demande.codeApercu);
      setCode('');
      setCodeRefuse(false);
      setEtape('code');
    } catch (err) {
      // Drapeau éteint entre l'affichage et l'envoi : la voie e-mail reste la seule.
      if (err instanceof ApiError && err.status === 404) {
        onEmail();
        return;
      }
      setErreur(messageDemande(err));
    } finally {
      setEnvoi(false);
    }
  }

  async function verifier(
    avecSecondFacteur: boolean,
    conditions: string | null = versionAcceptee,
    codeSaisi: string = code,
  ): Promise<void> {
    if (verificationEnCours.current) return;
    verificationEnCours.current = true;
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await verifierCodeTelephone(
        {
          phone: telephone,
          code: codeSaisi,
          ...(conditions ? { terms_version: conditions } : {}),
          ...(avecSecondFacteur
            ? codeDeSecours
              ? { recovery_code: secondFacteur }
              : { two_factor_code: secondFacteur }
            : {}),
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
        if (avecSecondFacteur) setErreur(t2fa('invalidCode'));
        setEtape('double-facteur');
        return;
      }
      await openSession(reponse.token, reponse.user, reponse.expires_at);
      await onConnecte(reponse.is_new_account === true, reponse.user);
    } catch (err) {
      // TCK-2404 (vérification adverse I2) — un code expiré pendant la lecture des conditions : retour à l'étape du code,
      // vidée, où se trouve le renvoi. La version acceptée reste, et accompagnera le code suivant.
      if (etape === 'conditions' && err instanceof ApiError && err.status === 422) {
        setCode('');
        setEtape('code');
      } else if (etape === 'code' && err instanceof ApiError && err.status === 422) {
        setCodeRefuse(true);
      }
      setErreur(messageVerification(err));
    } finally {
      verificationEnCours.current = false;
      setEnvoi(false);
    }
  }

  /** La frappe dans les six cases — et l'envoi, au passage à six chiffres, une fois. */
  function saisirCode(valeur: string): void {
    // Un code en vol : la frappe est ignorée (les cases sont `figee`), pour qu'aucun code non vérifié ne
    // s'affiche « incorrect » au refus du premier.
    if (verificationEnCours.current) return;
    const avant = code;
    setCode(valeur);
    setCodeRefuse(false);
    if (auSixiemeChiffre && valeur.length === LONGUEUR_DU_CODE && avant !== valeur) void verifier(false, versionAcceptee, valeur);
  }

  function revenirAuNumero(): void {
    setEtape('numero');
    setCode('');
    setCodeRefuse(false);
    setErreur(null);
    setVersionAcceptee(null);
  }

  /** TCK-2404 — la case cochée, la version présentée accompagne le même code. */
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
    caseConditions,
    setCaseConditions,
    envoyerCode,
    verifier,
    accepterConditions,
    revenirAuNumero,
  };
}

export type EntreeParTelephone = ReturnType<typeof useEntreeParTelephone>;
