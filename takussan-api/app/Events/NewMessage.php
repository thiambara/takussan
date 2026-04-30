<?php

namespace App\Events;

use App\Models\Conversation;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewMessage implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Conversation $conversation,
        public array $messageData,
        public int $recipientId,
    ) {}

    /** @return array<int, Channel> */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('App.Models.User.'.$this->recipientId),
        ];
    }

    public function broadcastAs(): string
    {
        return 'message.new';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversation->id,
            'message' => $this->messageData,
        ];
    }
}
