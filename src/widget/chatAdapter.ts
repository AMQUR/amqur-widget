import type { ChatMessage } from './types/chat';
import { sendChatMessage } from './api/chat.api';

type SendChatArgs = {
    apiBaseUrl: string;
    jwtToken?: string;
    userInput: string;
    conversationId?: string;
};

export async function sendChatFromWidget({
    apiBaseUrl,
    jwtToken,
    userInput,
    conversationId,
}: SendChatArgs): Promise<ChatMessage> {
    const res = await sendChatMessage({
        apiBaseUrl,
        jwtToken,
        message: userInput,
        conversationId,
    });

    const reply =
        typeof res.reply === 'string'
            ? res.reply
            : typeof res.message === 'string'
              ? res.message
              : '';

    return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        createdAt: Date.now(),
    };
}
