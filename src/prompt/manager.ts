import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { renderPrompt } from './renderer';
import { getScribeFolderUri, parseScribeBlock, removeScribeFolderPath, resolveRelativePath } from '../utils';


export type Prompt = {
    description: string;
    template: string;
    path: string;
    shortPath: string;
    followUp?: string;
    postProcess?: string;
    hide: boolean;
}


export type RenderedPrompt = {
    user: string,
    system?: string,
    followUp?: string,
}


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
            if (type === vscode.FileType.Directory && name === "logs") {
                continue;
            }

            const uri = vscode.Uri.joinPath(dirUri, name);
            if (type === vscode.FileType.Directory) {
                await this.scanDirectory(uri);
            } else if (type === vscode.FileType.File && name.endsWith('.md')) {
                await this.indexPrompt(uri);
            }
        }
    }

    private async indexPrompt(uri: vscode.Uri) {
        const pPath = uri.fsPath;
        const prompt = await this.getPrompt(pPath);
        if (!prompt || prompt.hide) {
            return;
        }
        const searchString = (prompt.description + prompt.shortPath).toLowerCase();
        this.searchIndex.set(searchString, pPath);
    }

    async getPrompt(pPath: string): Promise<Prompt | null> {
        const uri = vscode.Uri.file(pPath);
        const file = await vscode.workspace.fs.readFile(uri);
        const content = file.toString();
        const meta = parseScribeBlock(content);
        if (!meta) {
            return null;
        }

        // Turn follow_up and post_process paths from relative to absolute using the helper
        const followUp = meta.follow_up ? resolveRelativePath(pPath, meta.follow_up) : undefined;
        const postProcess = meta.post_process ? resolveRelativePath(pPath, meta.post_process) : undefined;

        return {
            description: meta.description,
            path: pPath,
            shortPath: removeScribeFolderPath(pPath),
            template: content,
            followUp: followUp,
            postProcess: postProcess,
            hide: meta.hide
        };
    }

    public async searchPrompt(searchString: string, limit: number = 8): Promise<Prompt[]> {
        const search = searchString.toLowerCase();
        const results: Prompt[] = [];

        for (const [key, pPath] of this.searchIndex.entries()) {
            if (key.includes(search)) {
                const prompt = await this.getPrompt(pPath);
                results.push(prompt!);
                if (results.length >= limit) {
                    break;
                }
            }
        }

        return results;
    }

    public async renderPrompt(pPath: string, extraVariables: any = {}): Promise<RenderedPrompt> {
        const prompt = await this.getPrompt(pPath);
        return await renderPrompt(prompt!, extraVariables);
    }
}