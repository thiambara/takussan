<?php

namespace Tests\Support;

use App\Ai\Agents\FilBrouillon;
use App\Ai\Agents\FilPromesses;
use App\Ai\Agents\FilQuestion;
use App\Ai\Agents\FilResume;
use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Message;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;

/**
 * TCK-2974 (ADR-0131) — la scène du copilote : celle de la note d'équipe (un groupe du bail d'une agence A, son
 * agent, un collègue, le locataire, le bailleur, un agent d'une autre agence), un socle IA d'essai sur le rôle
 * `redaction` (modèle fictif tarifé, aucun vrai fournisseur), et le faux du SDK qui garde l'entrée reçue.
 */
trait SceneDuCopilote
{
    use SceneDeNoteDEquipe;

    /** @var list<string> les entrées reçues par le faux modèle */
    protected array $entreesRecues = [];

    /** @var array<string, mixed>|null ce que rend le faux modèle (sinon un point sur le dernier message) */
    protected ?array $sortieDuModele = null;

    protected function installerLeCopilote(): void
    {
        config([
            'ai.providers.anthropic.key' => 'cle-de-test',
            'ai.roles.redaction' => [['provider' => 'anthropic', 'model' => 'modele-a', 'max_tokens' => 1000]],
            'ai.pricing' => ['anthropic' => [
                'modele-a' => ['input' => '2.0', 'output' => '10.0', 'cache_read' => '0.2', 'cache_write' => '2.5'],
            ]],
            'ai.budgets.daily_global_usd' => null,
            'ai.budgets.daily_per_agency_usd' => null,
            'ai.copilote.actif' => true,
        ]);

        FilResume::fake(function ($prompt) {
            $this->entreesRecues[] = is_string($prompt) ? $prompt : (string) ($prompt->prompt ?? '');

            return $this->sortieDuModele ?? ['points' => [[
                'texte' => 'Le locataire demande une visite.',
                'message_id' => (int) Message::query()->max('id'),
                'attend_le_lecteur' => true,
            ]]];
        });
    }

    /** TCK-2975 — les faux de `fil.question` et `fil.brouillon` : même entrée relevée, sortie par défaut citant le dernier message. */
    protected function installerLesAutresSortes(): void
    {
        $appui = fn () => [['nature' => 'message', 'id' => (int) Message::query()->max('id'), 'objet_type' => '']];
        FilQuestion::fake(function ($prompt) use ($appui) {
            $this->entreesRecues[] = is_string($prompt) ? $prompt : (string) ($prompt->prompt ?? '');

            return $this->sortieDuModele ?? ['reponse' => 'Oui, il a confirmé.', 'sources' => $appui()];
        });
        config(['ai.roles.extraction' => [['provider' => 'anthropic', 'model' => 'modele-a', 'max_tokens' => 1000]]]);
        FilPromesses::fake(function ($prompt) {
            $this->entreesRecues[] = is_string($prompt) ? $prompt : (string) ($prompt->prompt ?? '');

            return $this->sortieDuModele ?? ['promesses' => []];
        });
        FilBrouillon::fake(function ($prompt) use ($appui) {
            $this->entreesRecues[] = is_string($prompt) ? $prompt : (string) ($prompt->prompt ?? '');

            return $this->sortieDuModele ?? ['texte' => 'Bonjour, nous revenons vers vous.', 'appuis' => $appui()];
        });
    }

    /** `$n` messages `all` écrits directement (sans le limiteur de la route), par `$auteur`. */
    protected function ecrireDesMessages(int $n, User $auteur, ?Conversation $fil = null, string $texte = 'Bonjour, une question.'): Message
    {
        $premier = null;
        for ($i = 0; $i < $n; $i++) {
            $m = Message::query()->create([
                'conversation_id' => ($fil ?? $this->fil)->id,
                'sender_id' => $auteur->id,
                'content' => $texte.' '.$i,
                'type' => MessageType::Text->value,
                'visibility' => MessageVisibility::All->value,
            ]);
            $premier ??= $m;
        }

        return $premier;
    }

    protected function demanderUnResume(User $lecteur, int $depuisId, ?Conversation $fil = null): TestResponse
    {
        Sanctum::actingAs($lecteur);

        return $this->postJson('/api/conversations/'.($fil ?? $this->fil)->id.'/copilote/resume', ['depuis_message_id' => $depuisId]);
    }

    protected function etatDuCopilote(User $lecteur, ?Conversation $fil = null): TestResponse
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson('/api/conversations/'.($fil ?? $this->fil)->id.'/copilote');
    }
}
