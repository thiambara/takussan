<?php

namespace Database\Seeders\Operations;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MessageSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        Conversation::with('participants')->chunkById(50, function ($conversations) {
            foreach ($conversations as $conversation) {
                // Triés : la relation se charge sans ORDER BY, et PostgreSQL rend ses lignes dans l'ordre
                // que lui dicte l'état de la base — le même seed divergeait selon les tests joués avant.
                $participants = $conversation->participants->pluck('id')->sort()->values()->all();
                if (empty($participants)) {
                    continue;
                }

                $messageCount = mt_rand(5, 25);
                $cursor = CarbonImmutable::parse($conversation->created_at);
                $lastMessage = null;

                for ($i = 0; $i < $messageCount; $i++) {
                    $cursor = $this->instantSuivant($cursor, $i);
                    if ($cursor->greaterThan(Timeline::seedEnd())) {
                        break;
                    }

                    // TCK-2380 — un fil de bien parle du bien, entre le prospect qui l'a ouvert et le
                    // contact de l'agence ; un groupe parle du travail de l'équipe.
                    $sender = Tirage::un($participants);
                    $content = $conversation->property_id !== null
                        ? $this->ctx->texts()->messageDeProspect($sender === $conversation->created_by)
                        : $this->ctx->texts()->messageDEquipe();
                    $lastMessage = Message::withoutEvents(function () use (
                        $conversation, $sender, $content, $cursor
                    ) {
                        return Message::create([
                            'conversation_id' => $conversation->id,
                            'sender_id' => $sender,
                            'type' => MessageType::Text->value,
                            'content' => $content,
                            'created_at' => $cursor,
                            'updated_at' => $cursor,
                        ]);
                    });
                }

                if ($lastMessage) {
                    $this->lectures($conversation->id, $participants, $lastMessage);
                    $conversation->forceFill([
                        'last_message_id' => $lastMessage->id,
                        'last_message_preview' => Str::limit($lastMessage->content, 120),
                        'last_message_at' => $lastMessage->created_at,
                    ])->saveQuietly();
                }
            }
        });
    }

    /**
     * Le moment du message suivant : quelques minutes ou quelques heures dans un même échange, puis
     * des jours avant l'échange d'après (TCK-2378). Chaque date était tirée entre la précédente et
     * maintenant : un fil ouvert il y a un an avait l'essentiel de ses messages dans le dernier mois.
     */
    private function instantSuivant(CarbonImmutable $precedent, int $rang): CarbonImmutable
    {
        if ($rang === 0) {
            return $precedent->addMinutes(mt_rand(0, 30));
        }

        // Un échange se clôt une fois sur quatre ; le suivant vient de plus en plus tard.
        return mt_rand(1, 100) <= 75
            ? $precedent->addMinutes(mt_rand(2, 180))
            : Timeline::businessHour($precedent->addDays(mt_rand(1, 6) * mt_rand(1, 5)));
    }

    /**
     * Où chacun en est de sa lecture : l'auteur du dernier message l'a lu, les autres presque
     * toujours quand le fil est ancien, moins souvent quand il vient de bouger.
     *
     * @param  list<int>  $participants
     */
    private function lectures(int $conversationId, array $participants, Message $dernier): void
    {
        $recent = CarbonImmutable::parse($dernier->created_at)->greaterThan(Timeline::seedEnd()->subDays(7));

        foreach ($participants as $userId) {
            $lu = $userId === $dernier->sender_id || mt_rand(1, 100) <= ($recent ? 55 : 95);
            DB::table('conversation_participants')
                ->where('conversation_id', $conversationId)
                ->where('user_id', $userId)
                ->update(['last_read_at' => $lu
                    ? collect([CarbonImmutable::parse($dernier->created_at)->addMinutes(mt_rand(0, 240)), Timeline::seedEnd()])->min()
                    : CarbonImmutable::parse($dernier->created_at)->subMinute()]);
        }
    }
}
