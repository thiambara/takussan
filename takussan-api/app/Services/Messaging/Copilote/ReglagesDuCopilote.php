<?php

namespace App\Services\Messaging\Copilote;

use App\Ai\Usages\FilTranscriptionUsage;
use App\Models\Agency;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;

/**
 * TCK-2974 (ADR-0131, décisions du porteur du 2026-11-19) — LE seul point qui dit si une fonction du copilote
 * (`resume`, `question`, `brouillon`, `promesses`, `transcription`) est servie, et par quel modèle. Contrat
 * fixé avec TCK-2979, qui le branche sur `ai_usage_settings` (plateforme) et `AgencySettings` (agence) :
 *
 *  - {@see self::etat()} : `{active: bool, raison: 'plateforme'|'non_configuree'|'agence'|null}` ;
 *  - {@see self::agencesQuiCoupent()} : en lot, les agences qui ont coupé le copilote ;
 *  - {@see self::seuilDuResume()} (10), {@see self::retentionEnJours()} (30), {@see self::plafondDuJour()}
 *    (1,00 $, 0,50 $ pour la transcription) ;
 *  - {@see self::modele()} : le premier maillon de la fonction, par `ModelResolver` (le rôle de son usage).
 *
 * Ici (TCK-2974), il ne lit que `config('ai.copilote')`. La route, l'état et `copilote` de
 * `ConversationResource` passent tous par lui : rien d'autre n'est à rebrancher.
 */
final class ReglagesDuCopilote
{
    public const PLATEFORME = 'plateforme';

    public const NON_CONFIGUREE = 'non_configuree';

    public const AGENCE = 'agence';

    /** TCK-2976 — la fonction de transcription des notes vocales : pas une sorte de `POST …/copilote/{sorte}`. */
    public const TRANSCRIPTION = 'transcription';

    public function __construct(
        private readonly AiUsageRegistry $registre,
        private readonly ModelResolver $modeles,
    ) {}

    /** @return array{active: bool, raison: string|null} */
    public function etat(string $fonction, ?Agency $agence): array
    {
        $raison = match (true) {
            ! (bool) config('ai.copilote.actif', true) => self::PLATEFORME,
            config("ai.copilote.fonctions.{$fonction}", true) === false => self::PLATEFORME,
            // TCK-2976 (ADR-0131 § 7, décision 5a) — la transcription sans modèle (rôle `transcription` vide) n'est pas servie.
            $fonction === self::TRANSCRIPTION && $this->modele($fonction) === null => self::NON_CONFIGUREE,
            // TCK-2979 (ADR-0131 § 8) — l'agence ne peut qu'éteindre : lue APRÈS la plateforme et la configuration.
            $agence !== null && $agence->setting(self::reglageDAgence($fonction)) === false => self::AGENCE,
            default => null,
        };

        return ['active' => $raison === null, 'raison' => $raison];
    }

    /**
     * TCK-2979 (ADR-0131 § 8) — parmi `$agenceIds`, celles qui ont coupé la fonction par leur réglage
     * (`copilot_enabled`, ou `voice_transcription_enabled` pour la transcription), en UNE requête.
     *
     * @param  list<int>  $agenceIds
     * @return list<int>
     */
    public function agencesQuiCoupent(array $agenceIds = [], string $fonction = 'resume'): array
    {
        if ($agenceIds === []) {
            return [];
        }
        $cle = self::reglageDAgence($fonction);

        return Agency::query()
            ->whereIn('id', array_values(array_unique($agenceIds)))
            ->get(['id', 'settings'])
            ->filter(fn (Agency $a) => $a->setting($cle) === false)
            ->map(fn (Agency $a) => (int) $a->id)
            ->values()
            ->all();
    }

    /** TCK-2979 — le réglage d'agence qui coupe la fonction : un pour la transcription, un pour tout le reste. */
    public static function reglageDAgence(string $fonction): string
    {
        return $fonction === self::TRANSCRIPTION ? 'voice_transcription_enabled' : 'copilot_enabled';
    }

    public function seuilDuResume(): int
    {
        return (int) config('ai.copilote.seuil_du_resume', 10);
    }

    public function retentionEnJours(): int
    {
        return (int) config('ai.copilote.retention_en_jours', 30);
    }

    /** Le plafond par défaut d'une fonction, en dollars par jour (chaîne décimale, ADR-0086). */
    public function plafondDuJour(string $fonction): string
    {
        return (string) ($fonction === 'transcription'
            ? config('ai.copilote.plafond_transcription_usd', '0.50')
            : config('ai.copilote.plafond_du_jour_usd', '1.00'));
    }

    /** Le premier maillon que jouerait la fonction : la chaîne du rôle de son usage (`ModelResolver`). */
    public function modele(string $fonction): ?ModelLink
    {
        // TCK-2976 — la transcription a son usage hors des sortes.
        $usage = $fonction === self::TRANSCRIPTION ? FilTranscriptionUsage::KEY : SortesDuCopilote::usageDe($fonction);

        return $this->modeles->chainFor($this->registre->get($usage))[0] ?? null;
    }

    /**
     * L'état de chaque fonction du copilote pour cette agence : ce que `copilote` de `ConversationResource` rend
     * au personnel, pour que l'écran dise pourquoi une fonction est coupée.
     *
     * @return array<string, array{active: bool, raison: string|null}>
     */
    public function fonctions(?Agency $agence): array
    {
        $etats = [];
        foreach (SortesDuCopilote::sortes() as $fonction) {
            $etats[$fonction] = $this->etat($fonction, $agence);
        }

        return $etats;
    }
}
