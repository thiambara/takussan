<?php

namespace App\Services\Pont;

use App\Models\MessageRelay;

/**
 * TCK-2981 (ADR-0132 § 0, § 4) — UN envoi sortant du pont, par l'ORDRE DE REPLI de la configuration
 * (`config('messagerie.repli')`), sans nommer un canal : pour chaque canal déclaré et actif, le texte libre si sa
 * fenêtre est ouverte, puis son gabarit s'il en a la capacité ; le suivant seulement si l'échec est SÛR
 * ({@see ResultatDEnvoi::peutSeReplier()}) — un échec ambigu (délai, 5xx) s'arrête là (TCK-766).
 *
 * **Une opposition sur l'un des canaux du repli arrête tout** (ADR-0132 § 3) : le pont ne se replie pas sur le SMS
 * vers un numéro qui a dit STOP.
 *
 * `$exigeBoutons` : un canal sans la capacité « boutons » est sauté (l'invitation porte « Accepter les messages » ;
 * un SMS ne la porte pas, et une personne ne peut pas accepter par SMS).
 */
final class RelaisSortant
{
    public function __construct(private readonly RegistreDesCanaux $registre) {}

    /** @return list<CanalDuPont> les canaux de l'ordre de repli, déclarés et actifs */
    public function canaux(): array
    {
        $canaux = [];
        foreach ((array) config('messagerie.repli', []) as $nom) {
            if (in_array($nom, RegistreDesCanaux::noms(), true) && (bool) config('messagerie.canaux.'.$nom.'.actif', false)) {
                $canaux[] = $this->registre->canal((string) $nom);
            }
        }

        return $canaux;
    }

    /** Un canal du repli tient-il une opposition pour ce numéro ? */
    public function oppose(string $telephone): bool
    {
        foreach ($this->canaux() as $canal) {
            if ($canal->accord($telephone) === EtatDAccord::Oppose) {
                return true;
            }
        }

        return false;
    }

    /**
     * L'envoi. `null` : rien n'est parti et rien n'a été tenté (opposition, aucun canal disponible).
     *
     * @param  list<string>  $variables  les variables du gabarit
     * @return array{canal: CanalDuPont, resultat: ResultatDEnvoi}|null
     */
    public function envoyer(
        string $telephone,
        ?int $agence,
        string $texte,
        string $gabarit,
        string $langue,
        array $variables,
        ?string $boutonReponse = null,
        bool $exigeBoutons = false,
        // TCK-2981 — le repli tardif : seulement les canaux qui suivent celui-ci dans l'ordre de repli.
        ?string $apres = null,
    ): ?array {
        if ($this->oppose($telephone)) {
            return null;
        }
        $contexte = ['agency_id' => $agence, 'bouton_reponse' => $boutonReponse];
        $dernier = null;
        $canaux = $this->canaux();
        if ($apres !== null) {
            $rang = array_search($apres, array_map(fn (CanalDuPont $c) => $c->nom(), $canaux), true);
            $canaux = $rang === false ? [] : array_slice($canaux, $rang + 1);
        }
        foreach ($canaux as $canal) {
            $capacites = $canal->capacites();
            if ($exigeBoutons && ! $capacites->boutons) {
                continue;
            }
            $tentatives = [];
            if ($canal->fenetreOuverte($telephone, $agence)) {
                $tentatives[] = fn () => $canal->envoyerTexte($telephone, $texte, $contexte);
            }
            if ($capacites->gabarits) {
                $tentatives[] = fn () => $canal->envoyerGabarit($telephone, $gabarit, $langue, $variables, $contexte);
            }
            foreach ($tentatives as $tenter) {
                $resultat = $tenter();
                if ($resultat->statut !== ResultatDEnvoi::INDISPONIBLE) {
                    $dernier = ['canal' => $canal, 'resultat' => $resultat];
                }
                if (! $resultat->peutSeReplier()) {
                    return ['canal' => $canal, 'resultat' => $resultat];
                }
            }
        }

        return $dernier;
    }

    /** Écrit sur `$relais` ce que l'envoi a donné (canal, forme, identifiant, statut). */
    public function tracer(MessageRelay $relais, CanalDuPont $canal, ResultatDEnvoi $resultat): MessageRelay
    {
        $relais->forceFill([
            'channel' => $canal->nom(),
            'form' => $resultat->forme,
            'template' => $resultat->gabarit,
            'business_number_id' => $resultat->numeroDEntreprise ?? $relais->business_number_id,
            'provider_message_id' => $resultat->identifiantExterne,
            'status' => $resultat->envoye() ? MessageRelay::STATUS_ENVOYE : MessageRelay::STATUS_ECHEC,
            'failure_reason' => $resultat->envoye() ? null : mb_substr((string) $resultat->motif, 0, 255),
            'sent_at' => $resultat->envoye() ? now() : null,
            'failed_at' => $resultat->envoye() ? null : now(),
        ])->save();

        return $relais;
    }
}
