import { configManager } from './configManager';
import { countTokens, getOllamaContextLength, isOllamaRunning } from './utils';
import { RenderedPrompt } from './prompt/manager';
import { AIMessageChunk } from '@langchain/core/messages';

export type ModelParams = {
    type: string;
    name: string;
    cost: number[];
    limit: number;
    params: Record<string, any>;
}

export type ModelReport = {
    cost: number;
    model: string;
    tokenWarning: boolean;
}

export type PromptReport = {
    tokens: number;
    models: ModelReport[];
}

export type OutputReport = {
    costTotal: number;
    model: string;
    inTokens: number;
    outTokens: number;
}

class AccountingManager {
    // Accounting department: Costs, tokens, default models, api keys, etc.
    private static instance: AccountingManager;
    private costs: Record<string, number[]> = {};
    private models: ModelParams[] = [];
    private defaultModels: ModelParams[] = [];

    private constructor() { }

    public static getInstance(): AccountingManager {
        if (!AccountingManager.instance) {
            AccountingManager.instance = new AccountingManager();
        }
        return AccountingManager.instance;
    }

    async loadConfig() {
        const config = configManager.getConfig(true);
        if (!config) {
            return;
        }

        // Check available models via env variables
        const keys = [
            ["openai", "OPENAI_API_KEY"],
            ["microsoft", "AZURE_OPENAI_API_KEY"],
            ["anthropic", "ANTHROPIC_API_KEY"],
            ["google", "GOOGLE_API_KEY"],
            ["fireworks", "FIREWORKS_API_KEY"],
        ];

        const availableTypes = keys
            .filter(([, envVar]) => process.env[envVar])
            .map(([type]) => type);

        // Ollama
        if (await isOllamaRunning()) {
            availableTypes.push("ollama");
        }

        this.models = [];
        for (let model of config.models) {
            if (availableTypes.includes(model.type)) {
                // Add ollama metadata: Context length for ready models
                if (model.type === "ollama") {
                    model.cost = [0, 0, ""];
                    model.limit = 10000;
                    const length = await getOllamaContextLength(model.params.model);
                    model.limit = length || 10000;
                }

                this.models.push(model);
            }
        }

        // All default models, check if they are available
        this.defaultModels = [];
        for (const model of this.models) {
            if (config.default.includes(model.name)) {
                this.defaultModels.push(model);
            }
        }

        // Load costs
        this.costs = {};
        for (const model of this.models) {
            this.costs[model.name] = model.cost;
        }
    }
    public getPromptReport(renderedPrompt: RenderedPrompt, fullReport: boolean = false): PromptReport {
        let prompt = renderedPrompt.user;
        if (renderedPrompt.system) {
            prompt += renderedPrompt.system;
        }
        const tokens = countTokens(prompt);
        const tokensMillions = tokens / 1e6;
        const toCheck = fullReport ? this.models : this.defaultModels;

        let models: ModelReport[] = [];
        for (const model of toCheck) {
            const cost = model.cost[0] * tokensMillions;
            const tokenWarning = tokens > model.limit;
            models.push({ cost, model: model.name, tokenWarning });
        }
        return { tokens, models };
    }

    public getOutputReport(message: AIMessageChunk, model: string): OutputReport {
        let inTokens = 0;
        let outTokens = 0;

        if (message.response_metadata?.usage?.prompt_tokens != null) {
            // OpenAI
            inTokens = message.response_metadata.usage.prompt_tokens;
            outTokens = message.response_metadata.usage.completion_tokens;
        } else if (message.usage_metadata?.input_tokens != null) {
            // Anthropic
            inTokens = message.usage_metadata.input_tokens;
            outTokens = message.usage_metadata.output_tokens;
        } else {
            // Default
            inTokens = message.response_metadata?.tokenUsage?.input_tokens;
            outTokens = message.response_metadata?.tokenUsage?.output_tokens;
        }

        const costIn = this.costs[model][0] * (inTokens || 0) / 1e6;
        const costOut = this.costs[model][1] * (outTokens || 0) / 1e6;
        return {
            costTotal: costIn + costOut,
            model: model,
            inTokens: inTokens,
            outTokens: outTokens,
        };
    }
}

// Export instance of the accounting manager
export const accountingManager = AccountingManager.getInstance();