import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';

export interface Message {
  severity?: 'success' | 'info' | 'warning' | 'error';
  summary?: string;
  detail?: string;
  life?: number;
  id?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private messagesSubject = new BehaviorSubject<Message[]>([]);
  public messages$: Observable<Message[]> = this.messagesSubject.asObservable();

  constructor() {
  }

  /**
   * Add a new message to the message queue
   * @param message Message object to add
   */
  add(message: Message): void {
    const messageWithId = {
      ...message,
      id: this.generateId(),
      life: message.life || 5000 // Default to 5 seconds if not specified
    };

    const currentMessages = this.messagesSubject.value;
    this.messagesSubject.next([...currentMessages, messageWithId]);

    // Auto-remove message after specified life time
    if (messageWithId.life && messageWithId.life > 0) {
      setTimeout(() => {
        this.remove(messageWithId.id!);
      }, messageWithId.life);
    }
  }

  /**
   * Add multiple messages at once
   * @param messages Array of messages to add
   */
  addAll(messages: Message[]): void {
    messages.forEach(message => this.add(message));
  }

  /**
   * Remove a message by ID
   * @param messageId ID of the message to remove
   */
  remove(messageId: string): void {
    const currentMessages = this.messagesSubject.value;
    const filteredMessages = currentMessages.filter(msg => msg.id !== messageId);
    this.messagesSubject.next(filteredMessages);
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messagesSubject.next([]);
  }

  /**
   * Get current messages
   */
  getMessages(): Message[] {
    return this.messagesSubject.value;
  }

  /**
   * Convenience method for success messages
   */
  addSuccess(summary: string, detail?: string, life?: number): void {
    this.add({
      severity: 'success',
      summary,
      detail,
      life
    });
  }

  /**
   * Convenience method for error messages
   */
  addError(summary: string, detail?: string, life?: number): void {
    this.add({
      severity: 'error',
      summary,
      detail,
      life
    });
  }

  /**
   * Convenience method for warning messages
   */
  addWarn(summary: string, detail?: string, life?: number): void {
    this.add({
      severity: 'warning',
      summary,
      detail,
      life
    });
  }

  /**
   * Convenience method for info messages
   */
  addInfo(summary: string, detail?: string, life?: number): void {
    this.add({
      severity: 'info',
      summary,
      detail,
      life
    });
  }

  /**
   * Generate a unique ID for messages
   */
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}
