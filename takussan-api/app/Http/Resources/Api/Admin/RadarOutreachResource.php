<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\RadarOutreach;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\RadarOutreachWorkflow;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

/**
 * TCK-2388 (ADR-0077 §3, §4) — un message de démarchage pour la fiche annonceur. Il rend le texte ENREGISTRÉ
 * (`message`) : aucune lecture ne régénère quoi que ce soit. `status` : `prepared` (jamais envoyé), `sent`,
 * `closed` (issue finale ; `question` et `no_answer` restent `sent` : une réponse déposée plus tard peut encore les
 * changer). `follow_up` n'est posé que par {@see self::withFollowUp()}, pour chaque message OUVERT (dernier de sa chaîne, envoyé,
 * sans issue, une annonce encore `contacted`), échu ou non : `due_at` et `propose_no_answer` (vrai quand `max` relances
 * sont derrière lui ET que son échéance est passée) ; `null` pour tout autre.
 *
 * `segments` et `wa_me_url` viennent du composeur (`ConsentMessageComposer`), calculés depuis les colonnes enregistrées :
 * aucune lecture ne régénère quoi que ce soit. **Le texte enregistré fait foi** : si le découpage du gabarit actuel ne
 * redonne pas exactement `message` (l'origine du front a changé depuis, un fichier de clauses manque, la langue
 * enregistrée n'est plus servie), `segments` est un seul segment fixe qui porte le texte enregistré — la fiche ne
 * répond jamais 500 pour un message ancien. `generated` et `ai_error` ne sont posés que par {@see self::withGeneration()},
 * à la préparation : ce que le modèle a rendu n'est pas une propriété du message. `wa_me_url` n'existe que pour un message `prepared` dont les deux
 * parties sont écrites, dont l'annonceur n'a pas dit STOP et que « J'ai envoyé » n'est pas déjà sûr de refuser
 * (`RadarOutreachWorkflow::sendBlock()`) : on ne renvoie jamais deux fois le même lien. Un brouillon bloqué porte alors
 * `send_blocked`, le code de ce refus (`radar.outreach.follow_up_invalid`, `radar.outreach.listing_foreign`,
 * `radar.listing.stage_conflict`) ; `null` sinon. Il lit les annonces (`id`, `radar_advertiser_id`, `stage`) et le message
 * relancé (`followUpOf:id,outcome`) déjà chargés par l'appelant.
 */
class RadarOutreachResource extends BaseResource
{
    /** @var array{due_at: string|null, propose_no_answer: bool}|null */
    private ?array $followUp = null;

    /** @param  array{due_at: string|null, propose_no_answer: bool}|null  $followUp */
    public function withFollowUp(?array $followUp): static
    {
        $this->followUp = $followUp;

        return $this;
    }

    /** @var array{generated: bool, ai_error: string|null}|null */
    private ?array $generation = null;

    /** Pour la réponse de la préparation seule : le modèle a-t-il rédigé les deux parties, et sinon pourquoi. */
    public function withGeneration(bool $generated, ?string $aiError): static
    {
        $this->generation = ['generated' => $generated, 'ai_error' => $aiError];

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'locale' => $this->locale,
            'clauses_version' => $this->clauses_version,
            'status' => $this->status(),
            'listing_ids' => $this->listings->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all(),
            'salutation' => $this->salutation,
            'summary' => $this->summary,
            'message' => $this->message,
            'segments' => $this->segments(),
            'wa_me_url' => $this->waMeUrl(),
            'send_blocked' => $this->sendBlocked(),
            'follow_up_of_id' => $this->follow_up_of_id,
            'follow_up_rank' => $this->follow_up_rank,
            'created_by' => $this->creator === null ? null : [
                'id' => $this->creator->id,
                'name' => $this->creator->nameWithoutContact(),
            ],
            'created_at' => $this->iso($this->created_at),
            'sent_at' => $this->iso($this->sent_at),
            'outcome' => $this->enumValue($this->outcome),
            'outcome_at' => $this->iso($this->outcome_at),
            'follow_up' => $this->followUp,
            'consents' => RadarConsentResource::collection($this->consents)->toArray($request),
        ] + ($this->generation ?? []);
    }

    /** @return list<array{kind: string, text: string}> */
    private function segments(): array
    {
        try {
            $composer = app(ConsentMessageComposer::class);
            $segments = $composer->segments($this->locale, $this->salutation, $this->summary, $this->clauses_version, $composer->claimUrlFor($this->resource));
            if (implode('', array_column($segments, 'text')) === $this->message) {
                return $segments;
            }
        } catch (InvalidArgumentException|RuntimeException) {
            // Langue ou fichier de clauses qui ne se servent plus : le texte enregistré fait foi.
        }

        return [['kind' => 'fixed', 'text' => $this->message]];
    }

    private function waMeUrl(): ?string
    {
        $advertiser = $this->advertiser;
        $ready = ! $this->isSent()
            && trim($this->salutation) !== '' && trim($this->summary) !== ''
            && $advertiser?->phone !== null && $advertiser->do_not_contact_at === null
            && $this->sendBlocked() === null;

        return $ready ? app(ConsentMessageComposer::class)->waMeUrl($advertiser->phone, $this->message) : null;
    }

    /** Le code du refus qu'essuierait « J'ai envoyé » sur ce brouillon, ou `null` (un message déjà envoyé n'en a pas). */
    private function sendBlocked(): ?string
    {
        if ($this->isSent() || $this->advertiser === null) {
            return null;
        }
        /** @var RadarOutreach $outreach */
        $outreach = $this->resource;

        return app(RadarOutreachWorkflow::class)
            ->sendBlock($outreach, $this->advertiser, $outreach->listings, $outreach->followUpOf)['code'] ?? null;
    }

    private function status(): string
    {
        return match (true) {
            ! $this->isSent() => 'prepared',
            $this->outcome?->isFinal() === true => 'closed',
            default => 'sent',
        };
    }
}
