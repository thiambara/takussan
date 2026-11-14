'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ImagePlus, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { uploadAgencyLogoAction } from '@/app/actions/admin-agency';
import { useTraducteurValidation } from '@/hooks/useApiForm';
import { idDuChamp } from '@/lib/agence/fiche';
import { reduirePhotoSousPlafond } from '@/lib/reduire-photo';
import { AGENCY_LOGO_ACCEPT, AGENCY_LOGO_MAX_BYTES, validateAgencyLogoFile } from '@/lib/schemas/agency';
import { traduireMessageValidation } from '@/lib/schemas/messages';
import { cn } from '@/lib/utils';

import { RegenerateWatermarksCard } from '../RegenerateWatermarksCard';
import { ChampDeLaFiche, ZoneDeLaFiche } from './champs';
import { useEtatDuChamp, useFiche } from './contexte';
import { AdresseACopier } from './AdresseACopier';
import { EtiquetteDuChamp, LogoDeLAgence, TitreDeSection } from './pieces';

/**
 * TCK-2670 — « Identité et contact » : nom, adresse de la fiche publique (l'identifiant, en lecture
 * seule sauf la fois où il s'édite, TCK-1004), licence, description, e-mail, téléphone, site ; le
 * logo (déposé sur-le-champ, hors de l'enregistrement) et les filigranes.
 */
export function SectionIdentite() {
  const t = useTranslations('admin.agencyConfig');
  const tFiche = useTranslations('admin.agencyConfig.fiche.identite');
  const { agence, filigranes, adressePublique } = useFiche();
  const slugEditable = agence.slug_editable === true;

  // Un seul ordre dans le DOM, celui du téléphone (logo, identité, contact, filigranes) ; au bureau, la
  // grille de deux colonnes de la maquette le réordonne (`md:order-*`) — sans dupliquer un champ.
  return (
    <section aria-labelledby="titre-section-identite" data-section="identite">
      <TitreDeSection id="titre-section-identite" titre={tFiche('titre')} texte={tFiche('texte')} texteAuBureauSeulement />
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-x-5">
        <div className="mb-1 md:order-8 md:col-span-2 md:mb-0">
          <BlocDuLogo />
        </div>
        <EnTeteDeGroupe titre={t('identity.title')} texte={t('identity.description')} />
        <ChampDeLaFiche name="name" libelle={t('fields.name')} required className="md:order-1" />
        {slugEditable ? (
          <ChampDeLaFiche name="slug" libelle={t('fields.slugEditable')} aide={t('fields.slugEditableHint')} className="md:order-2" />
        ) : (
          <AdresseACopier
            libelle={tFiche('adresse')}
            adresse={adressePublique}
            aide={tFiche('adresseAide', { slug: agence.slug })}
            className="md:order-2"
          />
        )}
        <ChampDeLaFiche
          name="license_number"
          libelle={t('fields.license')}
          placeholder={t('fields.licensePlaceholder')}
          aide={<span className="max-md:hidden">{tFiche('licenceAide')}</span>}
          className="md:order-3"
        />
        <ZoneDeLaFiche
          name="description"
          libelle={t('fields.description')}
          rows={3}
          placeholder={t('fields.descriptionPlaceholder')}
          aide={tFiche('descriptionAide')}
          className="md:order-7 md:col-span-2"
        />
        <EnTeteDeGroupe titre={t('contact.title')} texte={t('contact.description')} separe />
        <ChampDeLaFiche name="email" libelle={t('fields.email')} type="email" className="md:order-4" />
        <ChampDeLaFiche name="phone" libelle={t('fields.phone')} type="tel" placeholder="+221 77 123 45 67" className="md:order-5" />
        <ChampDeLaFiche
          name="website"
          libelle={t('fields.website')}
          type="url"
          placeholder={t('fields.websitePlaceholder')}
          className="md:order-6"
        />
        {filigranes ? (
          <div className="mt-1 md:order-9 md:col-span-2 md:mt-0">
            <RegenerateWatermarksCard agencyId={agence.id} />
          </div>
        ) : null}
      </div>
      <p className="mt-5 text-ui text-muted-foreground md:hidden">{tFiche('enregistrerApparait')}</p>
    </section>
  );
}

/** Le titre d'un groupe de champs au téléphone ; au bureau, la grille n'en a pas. */
function EnTeteDeGroupe({ titre, texte, separe = false }: { readonly titre: string; readonly texte: string; readonly separe?: boolean }) {
  return (
    <div className={cn('md:hidden', separe && 'mt-1 border-t border-border pt-5')}>
      <h3 className="text-corps font-semibold">{titre}</h3>
      <p className="mt-0.5 text-pretty text-ui text-muted-foreground">{texte}</p>
    </div>
  );
}

/** Le logo : déposé tout de suite (`POST /api/media`), il n'attend pas « Enregistrer ». */
function BlocDuLogo() {
  const t = useTranslations('admin.agencyConfig');
  const tFiche = useTranslations('admin.agencyConfig.fiche.identite');
  const tValidation = useTraducteurValidation();
  const router = useRouter();
  const { agence, surAgenceRelue, annoncer } = useFiche();
  const { manque } = useEtatDuChamp('logo');
  const [apercu, setApercu] = useState<string | null>(agence.logo_url);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const fichier = useRef<HTMLInputElement>(null);

  async function choisir(ev: React.ChangeEvent<HTMLInputElement>) {
    setErreur(null);
    const input = ev.target;
    const choisi = input.files?.[0];
    if (!choisi) return;
    // TCK-2144 (P222.03) — réduit AVANT de juger la taille, comme l'avatar (TCK-1887).
    const reduit = await reduirePhotoSousPlafond(choisi, AGENCY_LOGO_MAX_BYTES);
    const refus = validateAgencyLogoFile(reduit);
    if (refus) {
      // Une CLÉ (`validation.agency.logoTooLarge`), pas un libellé (TCK-292).
      setErreur(traduireMessageValidation(refus, tValidation));
      input.value = '';
      return;
    }
    setApercu(URL.createObjectURL(reduit));
    demarrer(async () => {
      const donnees = new FormData();
      donnees.append('file', reduit);
      const resultat = await uploadAgencyLogoAction(agence.id, donnees);
      if (!resultat.ok) {
        setErreur(resultat.message);
        setApercu(agence.logo_url);
      } else if (resultat.data) {
        setApercu(resultat.data.logo_url);
        surAgenceRelue(resultat.data);
        annoncer(t('logoUpdated'));
        router.refresh();
      }
      input.value = '';
    });
  }

  return (
    <div className={cn('rounded-xl border bg-card p-3.5 md:flex md:items-center md:gap-4 md:p-4', manque ? 'border-dashed border-warning' : 'border-border')}>
      <div className="flex items-center gap-3.5 md:contents">
        <span className="md:hidden">
          <LogoDeLAgence url={apercu} nom={agence.name} taille={56} />
        </span>
        <span className="max-md:hidden">
          <LogoDeLAgence url={apercu} nom={agence.name} taille={64} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-corps font-medium md:text-sm">
            <EtiquetteDuChamp libelle={t('logo.title')} manque={manque} />
          </p>
          <p className="text-ui text-muted-foreground max-md:hidden">{tFiche('logoAide')}</p>
        </div>
        <input
          ref={fichier}
          type="file"
          accept={AGENCY_LOGO_ACCEPT}
          className="sr-only"
          // Relais du bouton, qui porte le geste et le nom (TCK-1031).
          tabIndex={-1}
          aria-hidden="true"
          onChange={(ev) => void choisir(ev)}
          disabled={enCours}
        />
        <Button
          id={idDuChamp('logo')}
          type="button"
          variant="outline"
          className="h-11 flex-none px-3.5"
          onClick={() => fichier.current?.click()}
          disabled={enCours}
        >
          {enCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
          <span>{enCours ? t('logo.uploading') : apercu ? t('logo.change') : t('logo.add')}</span>
        </Button>
      </div>
      <p className="mt-2.5 text-pretty text-ui leading-snug text-muted-foreground md:hidden">{tFiche('logoAide')}</p>
      {erreur ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
