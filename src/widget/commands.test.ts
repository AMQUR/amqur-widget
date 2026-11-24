import { afterEach, describe, expect, it } from 'vitest';
import {
    MAX_PROMPT_LENGTH,
    normalizePrompt,
    requestClose,
    requestOpen,
    requestSend,
    resetWidgetCommands,
    subscribeWidgetCommands,
    takePendingPrompt,
    type WidgetCommand,
} from './commands';
import { resolveDisplay } from './display';

afterEach(() => resetWidgetCommands());

describe('host-page widget commands', () => {
    it('accepts only non-empty strings and caps them at the composer limit', () => {
        expect(normalizePrompt('  Compare the Tahoe and Suburban  ')).toBe('Compare the Tahoe and Suburban');
        expect(normalizePrompt('   ')).toBeNull();
        expect(normalizePrompt('')).toBeNull();
        expect(normalizePrompt(undefined)).toBeNull();
        expect(normalizePrompt(42)).toBeNull();
        expect(normalizePrompt({ toString: () => 'x' })).toBeNull();
        expect(normalizePrompt('a'.repeat(MAX_PROMPT_LENGTH + 500))).toHaveLength(MAX_PROMPT_LENGTH);
    });

    it('queues a prompt, notifies subscribers and hands it out exactly once', () => {
        const seen: WidgetCommand[] = [];
        subscribeWidgetCommands((c) => seen.push(c));
        expect(requestSend('What is 17% of $42,500?')).toBe(true);
        expect(seen).toEqual(['send']);
        expect(takePendingPrompt()).toBe('What is 17% of $42,500?');
        expect(takePendingPrompt()).toBeNull();
    });

    it('holds a prompt sent before the chat is on screen; the latest one wins', () => {
        expect(requestSend('first')).toBe(true);
        expect(requestSend('second')).toBe(true);
        expect(takePendingPrompt()).toBe('second');
    });

    it('rejects invalid text without queueing or notifying', () => {
        const seen: WidgetCommand[] = [];
        subscribeWidgetCommands((c) => seen.push(c));
        expect(requestSend('   ')).toBe(false);
        expect(requestSend(null)).toBe(false);
        expect(seen).toEqual([]);
        expect(takePendingPrompt()).toBeNull();
    });

    it('delivers open and close, and stops after unsubscribe', () => {
        const seen: WidgetCommand[] = [];
        const off = subscribeWidgetCommands((c) => seen.push(c));
        requestOpen();
        requestClose();
        off();
        requestOpen();
        expect(seen).toEqual(['open', 'close']);
    });

    it('a throwing subscriber does not block the others', () => {
        const seen: WidgetCommand[] = [];
        subscribeWidgetCommands(() => {
            throw new Error('boom');
        });
        subscribeWidgetCommands((c) => seen.push(c));
        requestOpen();
        expect(seen).toEqual(['open']);
    });

    it('reset drops the queued prompt so it cannot reach the next store', () => {
        requestSend('Should I lease or finance?');
        resetWidgetCommands();
        expect(takePendingPrompt()).toBeNull();
    });
});

describe('display mode', () => {
    it('is floating unless inline is requested with a usable container', () => {
        const container = {} as HTMLElement;
        expect(resolveDisplay(undefined, null)).toBe('floating');
        expect(resolveDisplay('inline', null)).toBe('floating');
        expect(resolveDisplay('floating', container)).toBe('floating');
        expect(resolveDisplay('sidebar', container)).toBe('floating');
        expect(resolveDisplay('inline', container)).toBe('inline');
        expect(resolveDisplay(' Inline ', container)).toBe('inline');
    });
});
