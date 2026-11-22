'use client';

import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import { etatDeLaRequete, etatDuBloc, type EtatDeFile, type EtatDuBloc } from '@/lib/accueil/a-faire';
import { useAgingBalance } from '@/lib/queries/agency-reporting';
import { agencyKycQueryOptions, kycDemandeUnGeste, pendingInvitationsCountQueryOptions } from '@/lib/queries/agency-queues';
import {
  useAvisAModerer,
  useBienAValider,
  useDemandesAAttribuer,
  useEcheanceLaPlusEnRetard,
  useVisitesAConfirmer,
} from '@/lib/queries/accueil';

/**
 * TCK-2624 — les files de l'admin d'agence, lues une fois pour le téléphone et le bureau.
 *
 * ⚠ **Une file qui ne s'applique pas n'entre pas dans le compte** : `etatDeLaRequete` rendrait
 * « chargement » pour toujours d'une requête désactivée, et « Tout est à jour » ne se dirait jamais.
 * La liste des files se construit donc des MÊMES booléens que les `enabled`.
 *
 * Les files, dans l'ordre de la maquette (bien, demandes, visites, avis, impayés), plus les deux
 * lignes que « À traiter » de la Vue agence portait (KYC à compléter, invitations sans réponse) :
 * aucune régression (ticket, « Pas de régression »).
 */
export function useFilesDeLAdmin(agencyId: number) {
  const { token } = useAuth();
  const attribution = useCan('crm.assign', agencyId);
  const peutAttribuer = attribution.can;

  const bien = useBienAValider(true);
  const demandes = useDemandesAAttribuer(peutAttribuer);
  const visites = useVisitesAConfirmer(true);
  const avis = useAvisAModerer(true);
  // AC2 — le dossier KYC n'a une ligne que s'il demande un geste (`pending`, `rejected`) : un dossier
  // vérifié n'en a jamais. Même clé que l'écran KYC (`select` étroitit sans toucher au cache).
  const kyc = useQuery(agencyKycQueryOptions(agencyId));
  const invitations = useQuery(pendingInvitationsCountQueryOptions(token ?? null, true));
  const impayes = useAgingBalance(agencyId, 'tenant');
  const echeance = useEcheanceLaPlusEnRetard(true);

  const etats = {
    bien: etatDeLaRequete(bien, (d) => d.meta.total),
    demandes: attribution.isLoading ? ({ etat: 'chargement' } as const) : etatDeLaRequete(demandes, (d) => d.meta.total),
    visites: etatDeLaRequete(visites, (d) => d.meta.total),
    avis: etatDeLaRequete(avis, (d) => d.meta.total),
    kyc: etatDeLaRequete(kyc, (statut) => (kycDemandeUnGeste(statut) ? 1 : 0)),
    invitations: etatDeLaRequete(invitations, (n) => n),
    impayes: etatDeLaRequete(impayes, (d) => d.data.total.count),
  } satisfies Record<string, EtatDeFile>;

  const files: EtatDeFile[] = [
    etats.bien,
    // Sans `crm.assign` (une fois la capacité lue), la file n'existe pas pour ce profil.
    ...(attribution.isLoading || peutAttribuer ? [etats.demandes] : []),
    etats.visites,
    etats.avis,
    etats.kyc,
    etats.invitations,
    etats.impayes,
  ];
  const bloc: EtatDuBloc = etatDuBloc(files);

  const requetes = [bien, demandes, visites, avis, kyc, invitations, impayes];
  return {
    bloc,
    etats,
    peutAttribuer,
    /** Une file en échec alors que d'autres ont des lignes : le bloc le dit sous ses lignes. */
    enEchec: files.some((f) => f.etat === 'echec'),
    reessayer: () => {
      for (const q of requetes) if (q.isError) void q.refetch();
    },
    bien: bien.data ?? null,
    demandes: demandes.data ?? null,
    visites: visites.data ?? null,
    avis: avis.data ?? null,
    kyc: kyc.data ?? null,
    invitations: invitations.data ?? 0,
    impayes: impayes.data?.data ?? null,
    echeance: echeance.data?.data.find((row) => row.source === 'lease') ?? null,
  };
}

export type FilesDeLAdmin = ReturnType<typeof useFilesDeLAdmin>;
