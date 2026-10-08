/**
 * TCK-590 (passe 3, R1) — le sort du SMS au visiteur, rendu par les actions de l'agence sur une
 * visite (planifier, confirmer, déplacer, annuler). `sms_sent: false` : une borne d'envoi a retenu
 * le SMS ; l'e-mail et le fil sont partis, mais l'agent doit prévenir le client autrement. Le texte
 * affiché est celui du front (`visitPlanning.smsWithheld`) ; l'API ne fournit que le code.
 */
export interface SortDuSms {
  sms_sent?: boolean;
  sms_code?: string;
  sms_message?: string;
}

export function smsRetenu(reponse: unknown): boolean {
  return typeof reponse === 'object' && reponse !== null && (reponse as SortDuSms).sms_sent === false;
}
