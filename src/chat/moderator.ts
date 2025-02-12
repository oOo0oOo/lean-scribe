import { ChatModel } from "./model";
import { configManager } from "../configManager";
import { RenderedPrompt } from "../prompt/manager";
import { AIMessageChunk } from "@langchain/core/messages";


class ChatModerator {
    // Global singleton instance. Manages all chat models. 
    private static instance: ChatModerator;
    private models: { [key: string]: ChatModel } = {};
    private modelConfigs: any = {};

    static getInstance(): ChatModerator {
        if (!ChatModerator.instance) {
            ChatModerator.instance = new ChatModerator();
        }
        return ChatModerator.instance;
    }

    private constructor() {
        this.reloadModels();
    }

    reloadModels() {
        // Load models from json
        let config = configManager.getConfig(true);
        if (!config) {
            return;
        }

        // Lookup table for model names -> model configs
        this.modelConfigs = {};
        for (const model of config["models"]) {
            this.modelConfigs[model["name"]] = model;
        }
    }

    async getModel(modelName: string): Promise<ChatModel> {
        if (!this.models[modelName]) {
            this.models[modelName] = new ChatModel(this.modelConfigs[modelName]);
        }
        return this.models[modelName];
    }

    listModels(): string[] {
        return Object.keys(this.models);
    }

    removeModel(modelName: string) {
        delete this.models[modelName];
    }

    async * sendPrompt(modelName: string, rendered: RenderedPrompt): AsyncGenerator<AIMessageChunk> {
        const model = await this.getModel(modelName);
        yield* model.sendPrompt(rendered.user, rendered.system);
    }
}

export const chatModerator = ChatModerator.getInstance();