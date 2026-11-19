<?php

namespace App\Services\Messaging\Copilote;

use App\Ai\Usages\FilTranscriptionUsage;
use App\Models\Agency;
use App\Models\AiUsageSetting;
use App\Services\Ai\AiProviderCatalogue;
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
 * TCK-2974 l'a écrit sur `config('ai.copilote')` ; TCK-2979 le branche sur la console IA (`ai_usage_settings` :
 * interrupteur et modèle forcé de chaque usage `fil.*`) et sur les deux réglages de l'agence, sans changer ni ses
 * méthodes ni ses raisons. La route, l'état et `copilote` de `ConversationResource` passent tous par lui.
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
        private readonly AiProviderCatalogue $fournisseurs,
    ) {}

    /** @return array{active: bool, raison: string|null} */
    public function etat(string $fonction, ?Agency $agence): array
    {
        return $this->etatSelon($fonction, $agence, $this->reglagesDeLaConsole());
    }

    /**
     * @param  array<string, AiUsageSetting>  $console  les lignes `ai_usage_settings` des usages du copilote
     * @return array{active: bool, raison: string|null}
     */
    private function etatSelon(string $fonction, ?Agency $agence, array $console): array
    {
        $usage = self::usageDe($fonction);
        $raison = match (true) {
            ! (bool) config('ai.copilote.actif', true) => self::PLATEFORME,
            config("ai.copilote.fonctions.{$fonction}", true) === false => self::PLATEFORME,
            // TCK-2979 (ADR-0131 § 8) — l'interrupteur de l'usage dans la console IA (`ai_usage_settings.enabled`). La
            // passerelle juge toujours son coupe-circuit : ceci évite seulement de déposer un job voué au refus.
            ($console[$usage] ?? null)?->enabled === false => self::PLATEFORME,
            // TCK-2976 (ADR-0131 § 7, décision 5a) — la transcription sans modèle (rôle `transcription` vide) n'est pas servie.
            // TCK-2979 — « configurée » : un maillon d'un fournisseur sélectionnable qui transcrit, par le rôle ou par le
            // modèle forcé de l'usage dans la console.
            $fonction === self::TRANSCRIPTION && ! $this->transcriptionConfiguree($console[$usage] ?? null) => self::NON_CONFIGUREE,
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
        return $this->chaine($fonction, AiUsageSetting::query()->where('usage_key', self::usageDe($fonction))->first())[0] ?? null;
    }

    /**
     * TCK-2979 — ce que la passerelle jouerait : le modèle forcé de l'usage dans la console, sinon la chaîne de son rôle.
     *
     * @return list<ModelLink>
     */
    private function chaine(string $fonction, ?AiUsageSetting $reglage): array
    {
        return $this->modeles->chainFor($this->registre->get(self::usageDe($fonction)), $reglage);
    }

    private function transcriptionConfiguree(?AiUsageSetting $reglage): bool
    {
        foreach ($this->chaine(self::TRANSCRIPTION, $reglage) as $maillon) {
            if ($this->fournisseurs->selectable($maillon->provider) && $this->fournisseurs->transcribes($maillon->provider)) {
                return true;
            }
        }

        return false;
    }

    /** TCK-2976 — la transcription a son usage hors des sortes. */
    private static function usageDe(string $fonction): string
    {
        return $fonction === self::TRANSCRIPTION ? FilTranscriptionUsage::KEY : SortesDuCopilote::usageDe($fonction);
    }

    /**
     * TCK-2979 — les lignes de la console des usages du copilote, en UNE requête, indexées par usage.
     *
     * @return array<string, AiUsageSetting>
     */
    private function reglagesDeLaConsole(): array
    {
        return AiUsageSetting::query()
            ->whereIn('usage_key', [...SortesDuCopilote::usages(), FilTranscriptionUsage::KEY])
            ->get()
            ->keyBy('usage_key')
            ->all();
    }

    /**
     * TCK-2979 (ADR-0131 § 8) — ce que la plateforme laisse à l'agence, pour griser ses deux interrupteurs
     * (`AgencyResource::ai_platform`). Dérivé de {@see self::etat()} sans agence, jamais redéfini :
     *  - `copilot` : au moins une fonction couverte par `copilot_enabled` est servie par la plateforme ;
     *  - `transcription` : la transcription n'est pas coupée par la plateforme ;
     *  - `transcription_configured` : un fournisseur qui transcrit est affecté.
     *
     * @return array{copilot: bool, transcription: bool, transcription_configured: bool}
     */
    public function etatDeLaPlateforme(): array
    {
        $console = $this->reglagesDeLaConsole();
        $copilote = false;
        foreach (SortesDuCopilote::sortes() as $fonction) {
            $copilote = $copilote || $this->etatSelon($fonction, null, $console)['active'];
        }
        $transcription = $this->etatSelon(self::TRANSCRIPTION, null, $console)['raison'];

        return [
            'copilot' => $copilote,
            'transcription' => $transcription !== self::PLATEFORME,
            'transcription_configured' => $transcription === null,
        ];
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
        $console = $this->reglagesDeLaConsole();
        foreach (SortesDuCopilote::sortes() as $fonction) {
            $etats[$fonction] = $this->etatSelon($fonction, $agence, $console);
        }

        return $etats;
    }
}
