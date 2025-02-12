// Singleton manager, loads config from a file and provides access to it.
import { loadJSONInScribeFolder } from "./utils";

class ConfigManager {
    private static instance: ConfigManager;
    private config: any | null;

    private constructor() {
        this.loadConfig();
    }

    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    loadConfig() {
        this.config = loadJSONInScribeFolder('models.json');
    }

    getConfig(reload: boolean = false): any {
        if (reload) {
            this.loadConfig();
        }
        return this.config;
    }
}

export const configManager = ConfigManager.getInstance();