import { joursJusquA } from '@/components/payments/locataire/resume';
import type { LigneDuDu, ProchainLoyer, ResumeDuLoyer } from '@/types/invoice';

/**
 * TCK-2625 — ce que dit la carte « Loyer » de l'accueil du locataire, décidé sur le résumé servi par
 * l'API (`GET /api/me/rent-summary`, TCK-2649) : aucune addition ici, le total vient de l'API.
 *
 * La caution et sa restitution n'y entrent jamais : le résumé ne lit que les termes périodiques
 * (loyer, charges) et les pénalités, et `next_rent` que le loyer (`TenantRentSummary`).
 *
 *  - `du` : il reste quelque chose d'échu. La carte dit le TOTAL, le retard (le plus long des lignes
 *    qui en portent un ; aucun quand aucune n'en porte), et « Payer » vise l'échéance de loyer ou de
 *    charges payable en ligne la plus ancienne — jamais une pénalité seule, qui ne se paie pas par ce
 *    parcours. Sans échéance payable en ligne, pas de « Payer » : le dû se règle à l'agence.
 *  - `aJour` : rien d'échu ; le prochain loyer s'il est émis, payable d'avance s'il se paie en ligne.
 *  - `sansEcheance` : un bail en cours dont le premier loyer n'est pas encore programmé.
 *  - `null` : aucun bail (un client de réservation) — pas de carte.
 */
export type CarteDuLoyer =
  | {
      readonly genre: 'du';
      readonly total: number;
      readonly devise: string | null;
      /** Le plus grand `days_late` servi, `null` quand aucune ligne n'en porte (pénalités seules). */
      readonly joursDeRetard: number | null;
      /** L'échéance que « Payer » ouvre, `null` quand rien ne se paie en ligne. */
      readonly aPayer: LigneDuDu | null;
      /** Le nombre de lignes du dû : au-delà d'une, « Voir le détail ». */
      readonly lignes: number;
      readonly aLAgence: number;
    }
  | {
      readonly genre: 'aJour';
      readonly devise: string | null;
      readonly prochain: ProchainLoyer | null;
      /** Les jours jusqu'au prochain loyer, `null` sans prochain loyer. */
      readonly dans: number | null;
      readonly aLAgence: number;
    }
  | { readonly genre: 'sansEcheance' };

const PAYABLES: readonly string[] = ['rent', 'charges'];

export function carteDuLoyer(resume: ResumeDuLoyer | null | undefined, aujourdHui: string): CarteDuLoyer | null {
  if (!resume) return null;
  switch (resume.schedule_state) {
    case 'due': {
      const retards = resume.items.map((i) => i.days_late).filter((j): j is number => typeof j === 'number' && j > 0);
      const aPayer =
        [...resume.items]
          .filter((i) => PAYABLES.includes(i.kind) && i.payable_online)
          .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.lease_payment_id - b.lease_payment_id)[0] ?? null;
      return {
        genre: 'du',
        total: resume.total_due,
        devise: resume.currency,
        joursDeRetard: retards.length > 0 ? Math.max(...retards) : null,
        aPayer,
        lignes: resume.items.length,
        aLAgence: resume.parts.payable_at_agency,
      };
    }
    case 'up_to_date': {
      const prochain = resume.next_rent;
      return {
        genre: 'aJour',
        devise: prochain?.currency ?? resume.currency,
        prochain,
        dans: prochain ? joursJusquA(prochain.due_date, aujourdHui) : null,
        aLAgence: resume.parts.payable_at_agency,
      };
    }
    case 'none':
      return { genre: 'sansEcheance' };
    default:
      return null;
  }
}
