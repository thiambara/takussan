import { getTranslations } from 'next-intl/server';

import { PeriodeDuRapport } from '@/components/rapports/vues/pieces';
import { chiffresDeLAgent } from '@/lib/rapports/chiffres';
import { lireLeTableauDeLAgent } from '@/lib/rapports/tableau-de-l-agent';

import { BasculePortee, BlocPipeline } from './PiecesDeLAgent';

/**
 * TCK-2628 (L2) — l'onglet « Pipeline » de l'agent : les prospects par étape, une série. Il mène au pipeline
 * (famille 5), il ne le refait pas (hors périmètre du ticket).
 */
export async function OngletDuPipeline({ scope }: { readonly scope?: string | string[] }) {
  const [t, tRapports, tEtapes, { payload, peutVoirAgence, agence }] = await Promise.all([
    getTranslations('dashboard.agent'),
    getTranslations('rapports'),
    getTranslations('dashboard.pipelineStages'),
    lireLeTableauDeLAgent(scope),
  ]);
  if (!payload) return <PeriodeDuRapport>{t('loadError')}</PeriodeDuRapport>;
  const prospects = chiffresDeLAgent(payload.data, undefined, agence).find((c) => c.cle === 'prospects')?.valeur ?? 0;

  return (
    <div className="space-y-6">
      {peutVoirAgence ? <BasculePortee agence={agence} t={t} onglet="pipeline" /> : null}
      <BlocPipeline
        pipeline={payload.data.pipeline ?? {}}
        titre={t('pipelineChart')}
        total={tRapports('pipeline.prospects', { n: prospects })}
        vide={t('pipelineEmpty')}
        ouvrir={t('pipelineOpen')}
        nomDeLEtape={(e) => tEtapes(e)}
      />
    </div>
  );
}
