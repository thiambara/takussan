<?php

namespace App\Jobs\Copilote;

use App\Jobs\Concerns\RunsOnAiQueue;
use App\Models\Conversation;
use App\Models\Enums\AiDataClass;
use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Ai\ExternalContent;
use App\Services\Ai\SuggestionRecorder;
use App\Services\Messaging\Copilote\AppuisDuFil;
use App\Services\Messaging\Copilote\EtatDuCopilote;
use App\Services\Messaging\Copilote\GardeDuCopilote;
use App\Services\Messaging\Copilote\LectureDuFilPourIa;
use App\Services\Messaging\Copilote\PromessesDuFil;
use App\Services\Messaging\Copilote\SortesDuCopilote;
use App\Services\Messaging\EquipeDuFil;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\TempsReel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Request;
use Illuminate\Queue\InteractsWithQueue;

/**
 * TCK-2974 (ADR-0131 § 3) — une demande au copilote, hors de la requête HTTP, sur la file `ai`.
 *
 *  1. Il RECONSTRUIT le contexte du lecteur : une requête dont l'utilisateur est le demandeur et dont le profil
 *     actif est celui qu'il avait à la demande. `worker-ia` n'a ni requête ni profil actif ; sans eux, la
 *     lecture des notes et les ressources des objets jugeraient un autre lecteur.
 *  2. Il REJUGE la garde ({@see GardeDuCopilote::peutServir()}) : un agent parti entre la demande et le job
 *     n'obtient rien.
 *  3. Il construit l'entrée ({@see LectureDuFilPourIa}), appelle `AiGateway::run()` (acteur, agence du fil, fil
 *     en objet), retire toute citation hors de l'entrée, puis enregistre la proposition par
 *     `SuggestionRecorder::record()` (sujet = le fil, `input_snapshot` nul) avec la fenêtre résumée.
 *  4. Il émet `copilote.updated` au SEUL demandeur, après le COMMIT. Un `AiRefused` ou un `AiUnavailable` est
 *     absorbé : `ai_calls` porte déjà l'issue, et le même signal part.
 *
 * Rien ne s'écrit dans le fil : ni message, ni accusé de lecture, ni signal sur le canal du sujet. La marque
 * « en cours » est levée dans tous les cas (`finally`).
 */
final class DemanderAuCopilote implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, RunsOnAiQueue;

    /** Sous le `retry_after` de 90 s de la connexion `database` (ADR-0078). */
    public const TIMEOUT_SECONDS = 80;

    /** Le temps laissé à l'appel, tous maillons compris : le reste du passage (lecture, écriture) en a 10. */
    public const AI_CALL_BUDGET_SECONDS = self::TIMEOUT_SECONDS - 10;

    public int $timeout = self::TIMEOUT_SECONDS;

    /** Une demande ne se rejoue pas seule : le lecteur la refait, et un refus ne bloque jamais la suivante. */
    public int $tries = 1;

    /**
     * @param  array{depuis_message_id?: int, jusqu_a_message_id?: int}  $fenetre  la fenêtre d'un résumé
     * @param  array{question?: string, ton?: string}  $demande  TCK-2975 — la question, ou le ton du brouillon
     */
    public function __construct(
        public readonly int $lecteurId,
        public readonly int $filId,
        public readonly string $sorte,
        public readonly array $fenetre,
        public readonly ?string $profilType = null,
        public readonly ?int $profilId = null,
        public readonly array $demande = [],
    ) {
        $this->onAiQueue();
    }

    public function handle(AiGateway $passerelle, SuggestionRecorder $suggestions, GardeDuCopilote $garde, LectureDuFilPourIa $lecture): void
    {
        $lecteur = User::query()->find($this->lecteurId);
        $fil = Conversation::query()->find($this->filId);

        try {
            if ($lecteur === null || $fil === null) {
                return;
            }
            $this->dansLeContexteDe($lecteur, function (Request $requete) use ($lecteur, $fil, $passerelle, $suggestions, $garde, $lecture): void {
                if (! $garde->peutServir($lecteur, $fil)) {
                    return;
                }
                $usage = SortesDuCopilote::usageDe($this->sorte);
                $entree = $this->entree($lecture, $lecteur, $fil, $requete);

                try {
                    $resultat = $passerelle->run(new AiRequest(
                        usageKey: $usage,
                        input: $entree['prompt'],
                        dataClasses: [AiDataClass::Personnelle],
                        actor: $lecteur,
                        agencyId: EquipeDuFil::agence($fil),
                        subject: $fil,
                    ));
                } catch (AiRefused|AiUnavailable) {
                    return;
                }

                if ($this->sorte === SortesDuCopilote::PROMESSES) {
                    // Une suggestion PAR promesse, pour qu'elle se décide seule.
                    foreach (app(PromessesDuFil::class)->garder($resultat->structured['promesses'] ?? [], $entree['ids'], $fil, $lecteur) as $promesse) {
                        $suggestions->record($resultat, $fil, proposal: $promesse);
                    }

                    return;
                }
                $suggestions->record($resultat, $fil, proposal: $this->proposition($resultat->structured ?? [], $entree));
            });
        } finally {
            EtatDuCopilote::lever($this->lecteurId, $this->filId, $this->sorte);
            TempsReel::signalerA($this->lecteurId, CodeDeSignal::CopiloteUpdated);
        }
    }

    /**
     * L'entrée de la sorte. **Le brouillon ne lit jamais une note d'équipe** (`avecNotes: false`) : il partira au
     * fil entier (ADR-0131 § 2). La question les lit, et sa saisie est délimitée à part du fil.
     *
     * @return array{prompt: string, ids: list<int>, objets: list<array{type: string, id: int}>}
     */
    private function entree(LectureDuFilPourIa $lecture, User $lecteur, Conversation $fil, Request $requete): array
    {
        $lu = match ($this->sorte) {
            SortesDuCopilote::RESUME => $lecture->lire($lecteur, $fil, $requete, $this->fenetre['depuis_message_id'], $this->fenetre['jusqu_a_message_id'], avecNotes: true),
            SortesDuCopilote::QUESTION => $lecture->lire($lecteur, $fil, $requete, 1, PHP_INT_MAX, avecNotes: true, max: 300, contexte: 0),
            SortesDuCopilote::BROUILLON => $lecture->lire($lecteur, $fil, $requete, 1, PHP_INT_MAX, avecNotes: false, max: 50, contexte: 0),
            SortesDuCopilote::PROMESSES => $lecture->lire($lecteur, $fil, $requete, (int) $this->fenetre['depuis_message_id'], PHP_INT_MAX, avecNotes: false, max: 200, contexte: 10, horsSourcesDEngagement: true),
        };
        $engagements = $this->sorte === SortesDuCopilote::BROUILLON ? $lecture->engagementsEnCours($lecteur, $fil) : null;
        $prompt = match ($this->sorte) {
            SortesDuCopilote::QUESTION => ExternalContent::wrap('question', (string) ($this->demande['question'] ?? ''))."\n\n".$lu['texte'],
            SortesDuCopilote::BROUILLON => 'ton : '.(($this->demande['ton'] ?? 'normal') === 'court' ? 'court' : 'normal')."\n\n".$lu['texte']."\n\n".$engagements['texte'],
            SortesDuCopilote::PROMESSES => ExternalContent::wrap('participants', json_encode(
                $fil->participants()->wherePivotNull('left_at')->get()->map(fn (User $u) => ['id' => (int) $u->id, 'nom' => $u->nameWithoutContact()])->values()->all(),
                JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
            ))."\n\n".$lu['texte'],
            default => $lu['texte'],
        };

        return ['prompt' => $prompt, 'ids' => $lu['ids'], 'objets' => array_merge($lu['objets'], $engagements['objets'] ?? [])];
    }

    /**
     * La proposition enregistrée, ses citations filtrées AVANT écriture.
     *
     * @param  array<string, mixed>  $sortie
     * @param  array{ids: list<int>, objets: list<array{type: string, id: int}>}  $entree
     * @return array<string, mixed>
     */
    private function proposition(array $sortie, array $entree): array
    {
        return match ($this->sorte) {
            SortesDuCopilote::RESUME => [
                'points' => self::pointsCites($sortie['points'] ?? [], $entree['ids']),
                'depuis_message_id' => $this->fenetre['depuis_message_id'],
                'jusqu_a_message_id' => $this->fenetre['jusqu_a_message_id'],
            ],
            SortesDuCopilote::QUESTION => [
                'question' => (string) ($this->demande['question'] ?? ''),
                'reponse' => is_string($sortie['reponse'] ?? null) ? trim($sortie['reponse']) : '',
                'sources' => AppuisDuFil::garder($sortie['sources'] ?? [], $entree['ids'], $entree['objets']),
            ],
            SortesDuCopilote::BROUILLON => [
                'texte' => is_string($sortie['texte'] ?? null) ? trim($sortie['texte']) : '',
                'appuis' => AppuisDuFil::garder($sortie['appuis'] ?? [], $entree['ids'], $entree['objets']),
                'ton' => ($this->demande['ton'] ?? 'normal') === 'court' ? 'court' : 'normal',
            ],
        };
    }

    /**
     * Les points dont le `message_id` est un message de l'entrée : un identifiant inventé, ou mal formé, retire
     * son point. Le texte est une chaîne, `attend_le_lecteur` un booléen.
     *
     * @param  list<int>  $ids
     * @return list<array{texte: string, message_id: int, attend_le_lecteur: bool}>
     */
    public static function pointsCites(mixed $points, array $ids): array
    {
        if (! is_array($points)) {
            return [];
        }
        $connus = array_flip($ids);
        $gardes = [];
        foreach ($points as $point) {
            $id = is_array($point) ? ($point['message_id'] ?? null) : null;
            $texte = is_array($point) ? ($point['texte'] ?? null) : null;
            if (! is_int($id) && ! (is_string($id) && ctype_digit($id)) || ! isset($connus[(int) $id]) || ! is_string($texte) || trim($texte) === '') {
                continue;
            }
            $gardes[] = ['texte' => trim($texte), 'message_id' => (int) $id, 'attend_le_lecteur' => (bool) ($point['attend_le_lecteur'] ?? false)];
        }

        return $gardes;
    }

    /**
     * Joue `$travail` avec, pour requête courante, une requête du lecteur à son profil actif de la demande ; la
     * requête d'avant est rendue ensuite (en suite de tests, la file est synchrone et tourne dans la requête).
     *
     * @param  callable(Request): void  $travail
     */
    private function dansLeContexteDe(User $lecteur, callable $travail): void
    {
        $avant = app()->bound('request') ? app('request') : null;
        $requete = Request::create('/api/conversations/'.$this->filId.'/copilote/'.$this->sorte, 'POST');
        $requete->setUserResolver(fn () => $lecteur);
        $requete->attributes->set('active_profile', $this->profil($lecteur));
        app()->instance('request', $requete);

        try {
            $travail($requete);
        } finally {
            if ($avant !== null) {
                app()->instance('request', $avant);
            }
        }
    }

    /** Le profil actif de la demande, s'il appartient encore au lecteur. */
    private function profil(User $lecteur): ?Model
    {
        $classe = $this->profilType !== null ? Relation::getMorphedModel($this->profilType) ?? $this->profilType : null;
        if ($classe === null || ! is_a($classe, Model::class, true) || $this->profilId === null) {
            return null;
        }
        $profil = $classe::query()->find($this->profilId);

        return $profil !== null && (int) $profil->user_id === (int) $lecteur->id ? $profil : null;
    }
}
