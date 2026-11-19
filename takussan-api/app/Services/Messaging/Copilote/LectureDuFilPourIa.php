<?php

namespace App\Services\Messaging\Copilote;

use App\Ai\Usages\FilTranscriptionUsage;
use App\Models\AiSuggestion;
use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Message;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Ai\Evaluation\EvalCaseAnonymizer;
use App\Services\Ai\ExternalContent;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Messaging\ObjetsDesMessages;
use App\Support\PhoneMasker;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use RuntimeException;

/**
 * TCK-2974 (ADR-0131 § 2) — ce que le copilote lit d'un fil : ce que son LECTEUR en lit, rien de plus.
 *
 *  - les messages par {@see ConversationAccess::messagesLisiblesPar()} (notes d'équipe comprises pour le
 *    personnel), et, avec `$avecNotes = false`, `visibility = all` en plus (brouillon, promesses : TCK-2975) ;
 *  - les cartes, les événements et le sujet du fil par leur PROJECTION FERMÉE pour le lecteur
 *    ({@see ObjetsDesMessages}, chemins de `SujetsDuFil::projection()`), jamais par la ressource entière ;
 *    un objet qu'il ne lit pas reste `{indisponible: true}` ;
 *  - chaque message par son identifiant (que la sortie cite), son auteur (nom, rôle dans le fil), son type ;
 *    aucune pièce jointe : `image`, `document` et `audio` n'y sont que par leur type ;
 *  - toute chaîne masquée : téléphones (`PhoneMasker`) et adresses électroniques (`EvalCaseAnonymizer::EMAIL`),
 *    comme `MotsDuSignalement::citer`, quelle que soit la classe de l'usage ; le tout dans un bloc
 *    `ExternalContent::wrap()` (un message est une donnée, jamais une consigne).
 *
 * `$request` porte le lecteur (`user()`) et son profil actif : les ressources des objets jugent par lui. Le
 * job la reconstruit hors de toute requête HTTP.
 */
final class LectureDuFilPourIa
{
    public const ROLE_EQUIPE = 'equipe';

    public const ROLE_PARTICIPANT = 'participant';

    public function __construct(private readonly ConversationAccess $acces) {}

    /**
     * La fenêtre `[$depuisId, $jusquaId]` (les `$max` derniers au plus) et les `$contexte` messages qui la
     * précèdent.
     *
     * @return array{texte: string, ids: list<int>, objets: list<array{type: string, id: int}>}
     */
    public function lire(
        User $lecteur,
        Conversation $fil,
        Request $request,
        int $depuisId,
        int $jusquaId,
        bool $avecNotes = true,
        int $max = 200,
        int $contexte = 5,
    ): array {
        $fenetre = $this->lisibles($lecteur, $fil, $avecNotes)
            ->whereBetween('messages.id', [$depuisId, $jusquaId])
            ->orderByDesc('messages.id')->limit($max)->get()->reverse()->values();
        $avant = $this->lisibles($lecteur, $fil, $avecNotes)
            ->where('messages.id', '<', $depuisId)
            ->orderByDesc('messages.id')->limit($contexte)->get()->reverse()->values();

        $sujet = $this->sujetFictif($fil);
        $objets = ObjetsDesMessages::pour($lecteur, $avant->concat($fenetre)->when($sujet !== null, fn (Collection $c) => $c->push($sujet)), $request);

        $agence = EquipeDuFil::agence($fil);
        // TCK-2976 (ADR-0131 § 7) — la transcription d'une note vocale entre à la place du seul type `audio`, en UNE
        // requête pour la fenêtre ; masquée comme le reste ({@see self::masquer()}).
        $transcriptions = self::transcriptionsDe($avant->concat($fenetre));
        $roles = [];
        $ligne = function (Message $m) use ($objets, $agence, &$roles, $transcriptions): array {
            $auteur = $m->sender;
            if ($auteur !== null && ! array_key_exists((int) $auteur->id, $roles)) {
                $roles[(int) $auteur->id] = $agence !== null && PersonnelDeLAgence::estPersonnel($auteur, $agence)
                    ? self::ROLE_EQUIPE : self::ROLE_PARTICIPANT;
            }

            return array_filter([
                'id' => (int) $m->id,
                'date' => $m->created_at?->toAtomString(),
                'auteur' => $auteur !== null ? ['nom' => $auteur->nameWithoutContact(), 'role' => $roles[(int) $auteur->id]] : null,
                'type' => $m->type?->value,
                'note_d_equipe' => $m->visibility === MessageVisibility::Team ? true : null,
                'texte' => in_array($m->type, [MessageType::Text, null], true) ? $m->content : null,
                // TCK-2976
                'transcription' => $m->type === MessageType::Audio ? ($transcriptions[(int) $m->id] ?? null) : null,
                'code' => in_array($m->type, [MessageType::System, MessageType::Event, MessageType::Card], true)
                    ? ($m->metadata['event'] ?? $m->metadata['code'] ?? $m->content) : null,
                'objet' => ObjetsDesMessages::porteUnObjet($m) ? $objets->objetDe($m) : null,
            ], fn ($v) => $v !== null);
        };

        $donnees = [
            'fil' => array_filter([
                'titre' => $fil->subject,
                'sujet' => $sujet !== null ? $objets->objetDe($sujet) : null,
            ], fn ($v) => $v !== null),
            'contexte' => $avant->map($ligne)->all(),
            'fenetre' => $fenetre->map($ligne)->all(),
        ];

        $json = json_encode(self::masquer($donnees), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

        return [
            'texte' => ExternalContent::wrap('fil', $json),
            'ids' => $avant->concat($fenetre)->map(fn (Message $m): int => (int) $m->id)->values()->all(),
            // TCK-2975 — les objets (sujet et cartes) que le lecteur lit : seuls appuis `objet` admis.
            'objets' => $avant->concat($fenetre)->when($sujet !== null, fn (Collection $c) => $c->push($sujet))
                ->filter(fn (Message $m) => ObjetsDesMessages::porteUnObjet($m) && $objets->objetDe($m) !== ObjetsDesMessages::INDISPONIBLE)
                ->map(fn (Message $m) => ['type' => (string) ($m->metadata['object']['type'] ?? ''), 'id' => (int) ($m->metadata['object']['id'] ?? 0)])
                ->filter(fn (array $o) => $o['type'] !== '' && $o['id'] > 0)
                ->unique(fn (array $o) => $o['type'].':'.$o['id'])->values()->all(),
        ];
    }

    /** Les messages du fil que le lecteur lit, sans les supprimés, avec leur auteur. */
    /**
     * TCK-2976 — le texte transcrit des notes vocales de `$messages` (dernière `AiSuggestion` `fil.transcription` de
     * chacune), en une requête ; aucune requête sans note vocale.
     *
     * @param  Collection<int, Message>  $messages
     * @return array<int, string>
     */
    private static function transcriptionsDe(Collection $messages): array
    {
        $ids = $messages->filter(fn (Message $m) => $m->type === MessageType::Audio)->map(fn (Message $m) => (int) $m->id)->values()->all();
        if ($ids === []) {
            return [];
        }

        return AiSuggestion::query()
            ->where('usage_key', FilTranscriptionUsage::KEY)
            ->where('subject_type', (new Message)->getMorphClass())->whereIn('subject_id', $ids)
            ->orderByDesc('id')->get()->unique('subject_id')
            ->mapWithKeys(fn (AiSuggestion $s) => [(int) $s->subject_id => (string) ($s->proposal['texte'] ?? '')])
            ->filter(fn (string $t) => $t !== '')
            ->all();
    }

    private function lisibles(User $lecteur, Conversation $fil, bool $avecNotes)
    {
        $requete = Message::query()->where('messages.conversation_id', $fil->id)->with('sender');
        $requete = $this->acces->messagesLisiblesPar($lecteur, $requete, $fil);

        return $avecNotes ? $requete : $requete->where('messages.visibility', MessageVisibility::All->value);
    }

    /**
     * Le sujet du fil, présenté à `ObjetsDesMessages` comme une carte jamais écrite : son objet est jugé et
     * projeté pour le lecteur, comme celui d'une carte. Le sujet déclaré, sinon le bail, sinon le bien.
     */
    private function sujetFictif(Conversation $fil): ?Message
    {
        [$type, $id] = match (true) {
            $fil->subject_type !== null && $fil->subject_id !== null => [$fil->subject_type, (int) $fil->subject_id],
            $fil->lease_id !== null => ['lease', (int) $fil->lease_id],
            $fil->property_id !== null => ['property', (int) $fil->property_id],
            default => [null, null],
        };
        if ($type === null) {
            return null;
        }

        return (new Message)->forceFill(['type' => MessageType::Card, 'metadata' => ['object' => ['type' => $type, 'id' => $id]]]);
    }

    /** Toute chaîne, à toute profondeur : téléphones et adresses électroniques masqués. */
    private static function masquer(mixed $valeur): mixed
    {
        if (is_array($valeur)) {
            return array_map(self::masquer(...), $valeur);
        }
        if (! is_string($valeur)) {
            return $valeur;
        }

        return preg_replace(EvalCaseAnonymizer::EMAIL, EvalCaseAnonymizer::EMAIL_TOKEN, PhoneMasker::mask($valeur))
            ?? throw new RuntimeException('copilote.masquage_echoue');
    }
}
