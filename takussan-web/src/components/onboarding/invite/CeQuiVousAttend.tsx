'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote, Building2, IdCard, UserRound, Wrench, type LucideIcon } from 'lucide-react';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PieceDuProfil } from '@/lib/pieces/pieces';
import type { ResumeDInvite } from '@/lib/resume-d-invite';

/**
 * TCK-2613 (AC5) — le panneau voisin de l'écran 1 au bureau large (maquette `app-entree-assistants` a, « Ton
 * numéro, étape commune », bureau) : « {agence} vous attend · Juste après votre code », puis ce que l'écran 2
 * montrera. Sans résumé, il ne montre rien que l'invité n'ait déjà vu : le nom de l'agence, le rôle, et pour le
 * prestataire le titre de l'intervention jointe (`awaiting.maintenance_request.title`).
 *
 * TCK-2949 (ADR-0094, amendement du 2026-11-15 § 6) — chiffré par `invite-summary` (TCK-2939), lu par la page au
 * titulaire du profil actif : « N biens suivis par l'agence » + les titres (bailleur ; le parc de l'agence pour
 * l'agent), « Votre dernier loyer » (bailleur seul), « N pièces à envoyer » (les trois rôles). **Chaque ligne n'est
 * rendue que si l'API la sert** : un compte nul ou à zéro garde la ligne générique du rôle, un résumé absent (404,
 * `null`) rend le panneau de TCK-2613 tel quel. Les noms des pièces viennent de `GET /api/me/pieces` (même filtre que
 * l'API : obligatoires et `missing`) et ne s'écrivent que si leur nombre égale le compte du résumé.
 * Vouvoiement (ADR-0095) : la maquette tutoie, elle n'est pas une référence de ton.
 */
export type RoleDInvite = 'bailleur' | 'agent' | 'prestataire';

const ICONES: Readonly<Record<RoleDInvite, LucideIcon>> = { bailleur: Building2, agent: UserRound, prestataire: Wrench };

/** TCK-2949 — l'ordre des pièces nommées (celui de l'écran 2 du bailleur, puis les pièces du prestataire). */
const ORDRE_DES_PIECES = ['rib', 'cni', 'ninea', 'license', 'insurance', 'photo'] as const;
type CodeNomme = (typeof ORDRE_DES_PIECES)[number];

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join('');
}

export function CeQuiVousAttend({
  qui,
  agence,
  intervention = null,
  resume = null,
  pieces = null,
}: {
  readonly qui: RoleDInvite;
  readonly agence: string | null;
  /** Le titre de l'intervention jointe à l'invitation (prestataire) ; `null` sinon. */
  readonly intervention?: string | null;
  /** TCK-2949 — le résumé chiffré (`invite-summary`) ; `null` (404, échec) : les lignes génériques. */
  readonly resume?: ResumeDInvite | null;
  /** TCK-2949 — les pièces du profil, pour NOMMER celles à envoyer ; `null` : le compte seul. */
  readonly pieces?: readonly PieceDuProfil[] | null;
}) {
  const t = useTranslations('onboarding.invite.attente');
  const locale = useLocale();
  const fmt = useFormatteurs();
  const id = useId();
  const Icone = ICONES[qui];

  type Ligne = { readonly icone: LucideIcon; readonly titre: string; readonly texte: string };
  const generique: Ligne =
    qui === 'prestataire'
      ? intervention
        ? { icone: Icone, titre: t('prestataire.titre'), texte: intervention }
        : { icone: Icone, titre: t('prestataire.titreSans'), texte: t('prestataire.texteSans') }
      : { icone: Icone, titre: t(`${qui}.titre`), texte: t(`${qui}.texte`) };

  const lignes: Ligne[] = [];
  const nbBiens = qui === 'prestataire' ? 0 : (resume?.properties_count ?? 0);
  const titres = (resume?.titles ?? []).filter((x) => x.trim() !== '');
  if (qui === 'bailleur' && nbBiens > 0) {
    // Les titres servis (trois au plus) ; sans titre, le texte générique du bailleur.
    lignes.push({ icone: Building2, titre: t('chiffres.biens', { n: nbBiens }), texte: titres.length > 0 ? titres.join(', ') : t('bailleur.texte') });
  } else {
    lignes.push(generique);
  }
  if (qui === 'agent' && nbBiens > 0) {
    lignes.push({ icone: Building2, titre: t('chiffres.biens', { n: nbBiens }), texte: t('chiffres.parc') });
  }
  const loyer = qui === 'bailleur' ? (resume?.last_rent ?? null) : null;
  if (loyer && Number.isFinite(loyer.amount)) {
    const montant = fmt.montantCourt(loyer.amount);
    const date = loyer.paid_at ? fmt.jourMois(loyer.paid_at) : '';
    lignes.push({
      icone: Banknote,
      titre: t('chiffres.loyer'),
      texte: date ? t('chiffres.loyerRecu', { montant, date }) : t('chiffres.loyerRecuSansDate', { montant }),
    });
  }
  const nbPieces = resume?.missing_documents ?? 0;
  if (nbPieces > 0) {
    const noms = (pieces ?? [])
      .filter((p) => p.required && p.state === 'missing' && (ORDRE_DES_PIECES as readonly string[]).includes(p.code))
      .sort((a, b) => ORDRE_DES_PIECES.indexOf(a.code as CodeNomme) - ORDRE_DES_PIECES.indexOf(b.code as CodeNomme))
      .map((p) => t(`chiffres.noms.${p.code as CodeNomme}`));
    const liste = noms.length > 1 ? t('chiffres.et', { debut: noms.slice(0, -1).join(', '), fin: noms[noms.length - 1]! }) : (noms[0] ?? '');
    lignes.push({
      icone: IdCard,
      titre: t('chiffres.pieces', { n: nbPieces }),
      texte:
        noms.length === nbPieces
          ? t('chiffres.piecesDetail', { liste: liste.charAt(0).toLocaleUpperCase(locale) + liste.slice(1) })
          : t('chiffres.piecesSansNoms'),
    });
  }

  return (
    <aside aria-labelledby={`${id}-titre`} className="rounded-3xl bg-secondary/60 p-7">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="inline-flex size-11 flex-none items-center justify-center rounded-[0.625rem] bg-accent font-display text-sm font-semibold text-accent-foreground">
          {agence ? initiales(agence) : <Building2 className="size-5" strokeWidth={1.5} />}
        </span>
        <div className="min-w-0 leading-tight">
          <p id={`${id}-titre`} className="text-corps font-semibold">
            {agence ? t('titre', { agence }) : t('titreSans')}
          </p>
          <p className="text-ui text-muted-foreground">{t('sousTitre')}</p>
        </div>
      </div>
      <ul className="mt-6 space-y-4">
        {lignes.map((l) => (
          <li key={l.titre} className="flex items-start gap-3">
            <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-card text-primary-deep">
              <l.icone className="size-icone" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="leading-snug">
              <span className="block text-corps font-semibold">{l.titre}</span>
              <span className="block text-sm text-muted-foreground">{l.texte}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
