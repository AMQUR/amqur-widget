import { useState } from 'react';
import type { ChatMessage } from './types/chat';
import { sendChatFromWidget } from './chatAdapter';
import { useWidget } from './WidgetContext';

export function useChat() {
    const { config, conversationId } = useWidget();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);

    async function send(text: string) {
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            createdAt: Date.now(),
        };

        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            const assistantMsg = await sendChatFromWidget({
                apiBaseUrl: config.apiBaseUrl,
                jwtToken: config.jwtToken,
                userInput: text,
                conversationId,
            });

            setMessages(prev => [...prev, assistantMsg]);
        } finally {
            setLoading(false);
        }
    }

    return {
        messages,
        send,
        loading,
    };
}
