import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatFireworks } from "@langchain/community/chat_models/fireworks";
import { ChatOllama } from "@langchain/ollama";
import { AIMessageChunk } from "@langchain/core/messages";
import { pullOllamaModelIfNecessary } from "../utils";

type ModelType = 'openai' | 'anthropic' | 'google' | 'fireworks' | 'ollama';

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

    private constructor(modelInstance: any) {
        this.model = modelInstance;
    }

    public static async create(params: ModelParams): Promise<ChatModel> {
        let modelInstance: any;
        switch (params["type"]) {
            case 'anthropic':
                modelInstance = new ChatAnthropic({ ...params.params });
                break;
            case 'google':
                modelInstance = new ChatGoogleGenerativeAI({ ...params.params });
                break;
            case 'openai':
                modelInstance = new ChatOpenAI({ ...params.params });
                break;
            case 'fireworks':
                modelInstance = new ChatFireworks({ ...params.params });
                break;
            case 'ollama':
                await pullOllamaModelIfNecessary(params.params.model);
                modelInstance = new ChatOllama({ ...params.params });
                break;
            default:
                throw new Error('Unsupported model type');
        }
        return new ChatModel(modelInstance);
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