import { RenderedPrompt } from "./prompt/manager";

const MAX_HISTORY_LENGTH = 50;


export type HistoryItem = {
    text: string;
    model?: string;
}


class HistoryManager {
    private static instance: HistoryManager;

    private history: HistoryItem[] = [];

    private constructor() { }

    public static getInstance(): HistoryManager {
        if (!HistoryManager.instance) {
            HistoryManager.instance = new HistoryManager();
        }
        return HistoryManager.instance;
    }

    private checkMaxHistoryLength() {
        if (this.history.length > MAX_HISTORY_LENGTH) {
            this.history.pop();
        }
    }

    public addPrompt(prompt: RenderedPrompt) {
        this.history.unshift({ text: prompt.system + prompt.user });
        this.checkMaxHistoryLength();
    }

    public addReply(text: string, model: string) {
        this.history.unshift({ text, model });
        this.checkMaxHistoryLength();
    }

    public getHistoryItem(index: number): HistoryItem | undefined {
        return this.history[index];
    }
}

export const historyManager = HistoryManager.getInstance();