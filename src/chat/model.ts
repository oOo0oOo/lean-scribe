import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatFireworks } from "@langchain/community/chat_models/fireworks";
import { AIMessageChunk } from "@langchain/core/messages";

type ModelType = 'openai' | 'anthropic' | 'google' | 'fireworks';

interface ModelParams {
    [key: string]: any;
}

export type ModelReply = {
    text: string;
    inTokens: number;
    outTokens: number;
}

class ChatModel {
    private model: any;

    constructor(params: ModelParams) {
        switch (params["type"]) {
            case 'anthropic':
                this.model = new ChatAnthropic({ ...params.params });
                break;
            case 'google':
                this.model = new ChatGoogleGenerativeAI({ ...params.params });
                break;
            case 'openai':
                this.model = new ChatOpenAI({ ...params.params });
                break;
            case 'fireworks':
                this.model = new ChatFireworks({ ...params.params });
                break;
            default:
                throw new Error('Unsupported model type');
        }
    }

    async * sendPrompt(prompt: string, system: string = ""): AsyncGenerator<AIMessageChunk> {
        const messages = [];
        if (system) {
            messages.push({ role: "system", content: system });
        }
        messages.push({ role: "user", content: prompt });

        let stream;
        try {
            stream = await this.model.stream(messages);
        } catch (error) {
            if (error instanceof Error) {
                yield { content: error.message } as AIMessageChunk;
            } else {
                yield { content: error } as AIMessageChunk;
            }
            return;
        }

        // Yield incremental chunks
        for await (const chunk of stream) {
            yield chunk;
        }
    }
}

export { ChatModel, ModelType, ModelParams };