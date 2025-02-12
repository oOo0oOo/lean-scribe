import * as vscode from 'vscode';

import { loadWorkspaceEnv } from './utils';
loadWorkspaceEnv();

import { Scribe } from './scribe';
import { PromptManager } from './prompt/manager';

export async function activate(context: vscode.ExtensionContext) {
    await PromptManager.initialize();

    const scribe = Scribe.getInstance(context);
    scribe.register();
}

export function deactivate() { }