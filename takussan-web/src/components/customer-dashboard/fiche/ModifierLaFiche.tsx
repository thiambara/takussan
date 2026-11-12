'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { CustomerForm } from '@/components/customer-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import type { CustomerDetail } from '@/types/customer';

/**
 * TCK-2589 (lot D) — « Modifier » de la fiche client : le formulaire d'édition, qui vivait dans l'onglet
 * « Aperçu », s'ouvre dans le panneau de droite en mode formulaire (décision 10a) — plein écran et
 * « Enregistrer » collant sous `xl`, 480 px non modal dès `xl`. Ouverture en état local.
 *
 * Le formulaire est `CustomerForm` en forme `feuille` (9a) : Identité, Contact, Ce qu'il cherche, Pièce,
 * sans l'étape (8a). Sa validation, ses 422, son doublon (409) et la révélation de la pièce restent les
 * siens. Enregistré : le panneau se ferme et la page se relit.
 *
 * GARDE DE SORTIE — fermer (croix, `Échap`, « Annuler ») une saisie modifiée demande d'abord
 * « Abandonner les modifications ? » ; « Continuer la saisie » garde le panneau ouvert, la saisie
 * intacte. Recharger ou fermer l'onglet : la boîte du navigateur (`useAvertissementDepart` du formulaire).
 */
export interface ModifierLaFicheProps {
  readonly customer: CustomerDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly peutReveler: boolean;
}

const ID_DU_FORMULAIRE = 'modifier-la-fiche';

export function ModifierLaFiche({ customer, open, onOpenChange, peutReveler }: ModifierLaFicheProps) {
  const t = useTranslations('crm.fiche.modifier');
  const router = useRouter();
  const [etat, setEtat] = useState({ enCours: false, modifie: false });
  const [sortieDemandee, setSortieDemandee] = useState(false);

  const fermer = () => {
    setSortieDemandee(false);
    setEtat({ enCours: false, modifie: false });
    onOpenChange(false);
  };
  const demanderLaFermeture = () => {
    if (etat.enCours) return;
    if (etat.modifie) setSortieDemandee(true);
    else fermer();
  };

  const pied = (
    <>
      <Button type="button" variant="ghost" onClick={demanderLaFermeture} disabled={etat.enCours}>
        {t('annuler')}
      </Button>
      <Button type="submit" form={ID_DU_FORMULAIRE} disabled={etat.enCours}>
        {etat.enCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {etat.enCours ? t('enregistrement') : t('enregistrer')}
      </Button>
    </>
  );

  return (
    <>
      <PanneauDroit
        open={open}
        formulaire
        onOpenChange={(o) => (o ? onOpenChange(true) : demanderLaFermeture())}
        titre={t('titre')}
        pied={pied}
      >
        {open ? (
          <CustomerForm
            mode="edit"
            forme="feuille"
            idDuFormulaire={ID_DU_FORMULAIRE}
            customer={customer}
            canRevealIdNumber={peutReveler}
            onEtat={setEtat}
            onSuccess={() => {
              fermer();
              router.refresh();
            }}
          />
        ) : null}
      </PanneauDroit>
      <Dialog open={sortieDemandee} onOpenChange={(o) => (o ? null : setSortieDemandee(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sortie.titre')}</DialogTitle>
            <DialogDescription>{t('sortie.texte')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fermer}>
              {t('sortie.abandonner')}
            </Button>
            <Button type="button" onClick={() => setSortieDemandee(false)}>
              {t('sortie.rester')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
