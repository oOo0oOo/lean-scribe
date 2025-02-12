import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { renderPrompt } from './renderer';
import { getScribeFolderUri, removeScribeFolderPath } from '../utils';


export type Prompt = {
    description: string;
    template: string;
    path: string;
    shortPath: string;
    followUp?: string;
}

export type RenderedPrompt = {
    user: string,
    system?: string,
    followUp?: string,
}

// Regex to extract description string.
// {% prompt "Description here" %}
// Half compliant with " or ' and allow for arbitrary whitespace.
const metaRegex = /{%\s*scribe\s*["']\s*(.*?)\s*["']\s*(?:,\s*["']\s*(.*?)\s*["'])?\s*%}/;

export class PromptManager {
    private static instance: PromptManager;
    private searchIndex: Map<string, string> = new Map();

    private constructor() { }

    public static async initialize(): Promise<void> {
        if (!PromptManager.instance) {
            PromptManager.instance = new PromptManager();
            await this.instance.indexAllPrompts();
        }
    }

    public static getInstance(): PromptManager {
        return PromptManager.instance;
    }

    async indexAllPrompts() {
        const fUri = getScribeFolderUri();
        if (!fUri) {
            return;
        }
        await this.scanDirectory(fUri);
    }

    private async scanDirectory(dirUri: vscode.Uri) {
        const files = await vscode.workspace.fs.readDirectory(dirUri);

        for (const [name, type] of files) {
            const uri = vscode.Uri.joinPath(dirUri, name);
            if (type === vscode.FileType.Directory) {
                await this.scanDirectory(uri);
            } else if (type === vscode.FileType.File && name.endsWith('.md')) {
                await this.indexPrompt(uri);
            }
        }
    }

    private async indexPrompt(uri: vscode.Uri) {
        // Short path
        const pPath = uri.fsPath;
        const shortPath = removeScribeFolderPath(pPath);

        // Open file and extract description
        const file = await vscode.workspace.fs.readFile(uri);
        const content = file.toString();
        const match = metaRegex.exec(content);
        const desc = match ? match[1] : '';
        const searchString = (desc + shortPath).toLowerCase();
        this.searchIndex.set(searchString, pPath);
    }

    async getPrompt(pPath: string): Promise<Prompt> {
        const uri = vscode.Uri.file(pPath);
        const file = await vscode.workspace.fs.readFile(uri);
        const content = file.toString();

        const match = metaRegex.exec(content);
        const desc = match ? match[1] : '';
        let followup = match && match[2] ? match[2] : undefined;

        // Turn follow from relative to absolute path
        if (followup) {
            const dir = path.dirname(pPath);
            const followPath = path.resolve(dir, followup);
            if (fs.existsSync(followPath)) {
                followup = followPath;
            } else {
                followup = undefined;
            }
        }
        return {
            description: desc,
            path: pPath,
            shortPath: removeScribeFolderPath(pPath),
            template: content,
            followUp: followup
        };
    }

    public async searchPrompt(searchString: string, limit: number = 8): Promise<Prompt[]> {
        const search = searchString.toLowerCase();
        const results: Prompt[] = [];

        for (const [key, pPath] of this.searchIndex.entries()) {
            if (key.includes(search)) {
                const prompt = await this.getPrompt(pPath);
                results.push(prompt);
                if (results.length >= limit) {
                    break;
                }
            }
        }

        return results;
    }

    public async renderPrompt(pPath: string): Promise<RenderedPrompt> {
        const prompt = await this.getPrompt(pPath);
        return await renderPrompt(prompt);
    }
}