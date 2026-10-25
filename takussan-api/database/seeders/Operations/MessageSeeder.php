<?php

namespace Database\Seeders\Operations;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class MessageSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        Conversation::with('participants')->chunkById(50, function ($conversations) {
            foreach ($conversations as $conversation) {
                $participants = $conversation->participants->pluck('id')->all();
                if (empty($participants)) {
                    continue;
                }

                $messageCount = mt_rand(5, 25);
                $cursor = $conversation->created_at->copy();
                $lastMessage = null;

                for ($i = 0; $i < $messageCount; $i++) {
                    $cursor = Timeline::randomDateBetween(
                        $cursor,
                        Timeline::seedEnd(),
                    );

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
                    $conversation->forceFill([
                        'last_message_id' => $lastMessage->id,
                        'last_message_preview' => Str::limit($lastMessage->content, 120),
                        'last_message_at' => $lastMessage->created_at,
                    ])->saveQuietly();
                }
            }
        });
    }
}
