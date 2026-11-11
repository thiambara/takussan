import { Progress, ProgressSegments } from 'takussan';

export function Tones() {
  return (
    <div className="max-w-md space-y-4">
      <Progress aria-label="Crédits utilisés" value={60} />
      <Progress aria-label="Dossier complet" value={100} ton="success" />
      <Progress aria-label="Quota presque atteint" value={85} ton="warning" />
      <Progress aria-label="Profil renseigné" value={30} ton="neutral" taille="grand" />
    </div>
  );
}

export function Steps() {
  return (
    <ProgressSegments
      className="max-w-md"
      aria-label="Étapes de la publication"
      aria-valuetext="Étape 2 sur 4"
      value={2}
      total={4}
    />
  );
}
