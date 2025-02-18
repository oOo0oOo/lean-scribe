import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import https from 'https';
import AdmZip from 'adm-zip';
import os from 'os';

import { PromptManager } from './prompt/manager';
import { accountingManager } from './accounting';
import { chatModerator } from './chat/moderator';
import { logger } from './logger';
import { getPriceAndLoggingSettings, loadMostRecentLeanTextEditor, loadWorkspaceEnv, cleanReply } from './utils';
import { historyManager } from './history';
import { AIMessageChunk } from '@langchain/core/messages';
import { configManager } from './configManager';
import { hasCurrentLeanEditor } from './prompt/variables';
import { isLean4ExtensionLoaded } from './prompt/lsp';

export class Scribe {
    private static instance: Scribe;
    private panel?: vscode.WebviewPanel;
    private promptManager = PromptManager.getInstance();

    private constructor(private context: vscode.ExtensionContext) { }

    static getInstance(context: vscode.ExtensionContext): Scribe {
        if (!Scribe.instance) {
            Scribe.instance = new Scribe(context);
        }
        return Scribe.instance;
    }

    register() {
        // Setup lean-scribe command (sets up global folder)
        const setup_cmd = vscode.commands.registerCommand('lean-scribe.setup', async () => {
            const defaultFolder = path.join(os.homedir(), 'scribe');
            const choice = await vscode.window.showInformationMessage(
                `Do you want to use the default scribe folder location? ${defaultFolder}`,
                'Use Default Location',
                'Choose Another Location',
                'Cancel'
            );
            if (!choice || choice === 'Cancel') {
                return;
            }

            let scribeFolder = defaultFolder;

            if (choice === 'Choose Another Location') {
                const folderPath = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select scribe folder',
                    defaultUri: vscode.Uri.file(defaultFolder)
                });
                if (!folderPath) {
                    return;
                }
                scribeFolder = folderPath[0].fsPath;
            }

            if (!fs.existsSync(scribeFolder)) {
                fs.mkdirSync(scribeFolder);
            }

            vscode.workspace.getConfiguration('lean-scribe').update('scribeFolder', scribeFolder, true);

            const setupDefaults = await vscode.window.showInformationMessage(
                'Set up default prompts and models in scribe folder?',
                'Yes (recommended)',
                'No'
            );
            if (setupDefaults === 'Yes (recommended)') {
                try {
                    // Download zip from GitHub, then copy default_scribe_folder to scribeFolder
                    const downloadUrl = 'https://codeload.github.com/oOo0oOo/lean-scribe/zip/refs/heads/main';

                    const dataChunks: Buffer[] = [];
                    await new Promise<void>((resolve, reject) => {
                        https.get(downloadUrl, (res: any) => {
                            res.on('data', (chunk: Buffer) => dataChunks.push(chunk));
                            res.on('end', resolve);
                            res.on('error', reject);
                        });
                    });

                    const zip = new AdmZip(Buffer.concat(dataChunks));
                    const tmpDir = path.join(os.tmpdir(), `lean-scribe-temp-${Date.now()}`);
                    fs.mkdirSync(tmpDir, { recursive: true });
                    zip.extractAllTo(tmpDir, true);

                    const exampleDir = path.join(tmpDir, 'lean-scribe-main', 'default_scribe_folder');
                    if (!fs.existsSync(exampleDir)) {
                        throw new Error('default_scribe_folder not found in downloaded archive.');
                    }

                    await this.copyDirectory(exampleDir, scribeFolder);

                    fs.rmSync(tmpDir, { recursive: true, force: true });

                    // Add API keys to .env
                    const addKeys = await vscode.window.showInformationMessage(
                        'API keys are required to use the models. Do you want to add API keys to the .env file now?',
                        'Yes',
                        'No'
                    );

                    if (addKeys === 'Yes') {
                        const envPath = path.join(scribeFolder, '.env');
                        const uri = vscode.Uri.file(envPath);
                        const doc = await vscode.workspace.openTextDocument(uri);
                        await vscode.window.showTextDocument(doc);
                    }

                } catch (err: any) {
                    vscode.window.showErrorMessage(`Error setting up defaults: ${err.message}`);
                }
            }
            this.refreshScribe();
            vscode.window.showInformationMessage('Scribe folder has been set up:\n' + scribeFolder);
        });
        this.context.subscriptions.push(setup_cmd);

        const cmd = vscode.commands.registerCommand('lean-scribe.openLeanScribe', () => {
            this.refreshScribe();
            if (this.panel) {
                this.panel.reveal(vscode.ViewColumn.Beside);
            } else {
                this.panel = vscode.window.createWebviewPanel(
                    'scribeWebview',
                    '📜 Lean Scribe',
                    vscode.ViewColumn.Beside,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))],
                    }
                );
                this.panel.webview.html = this.getHtmlContent();
                this.handleMessages(this.panel.webview);
                this.panel.onDidDispose(() => (this.panel = undefined));

                const theme = vscode.workspace.getConfiguration('lean-scribe').get('codeColorScheme');
                this.panel.webview.postMessage({ command: 'set_hljs_theme', theme });
            }
        });
        this.context.subscriptions.push(cmd);
    }

    private async copyDirectory(srcDir: string, destDir: string) {
        const entries = fs.readdirSync(srcDir, { withFileTypes: true });

        fs.mkdirSync(destDir, { recursive: true });

        for (const entry of entries) {
            const srcPath = path.join(srcDir, entry.name);
            const destPath = path.join(destDir, entry.name);

            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                // Do not overwrite .env file
                if (entry.name === '.env' && fs.existsSync(destPath)) {
                    continue;
                }
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    private getHtmlContent(): string {
        const htmlPath = path.join(this.context.extensionPath, 'media', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        const webview = this.panel?.webview;
        const scriptUri = webview?.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'main.js')));
        const styleUri = webview?.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'style.css')));

        html = html.replace('src="main.js"', `src="${scriptUri}"`).replace('href="style.css"', `href="${styleUri}"`);
        return html;
    }

    private handleMessages(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (message) => {
            const settings = getPriceAndLoggingSettings();

            switch (message.command) {
                case 'run_prompt':
                    vscode.window.showInformationMessage(`Prompting: ${message.model}`);
                    const messageId = Math.random().toString(36).substring(2, 15);
                    const response = await chatModerator.sendPrompt(message.model, message.rendered);

                    // Receive the first chunk
                    let first = await response.next();
                    let accumulatedChunks: AIMessageChunk = first.value;

                    if (first.done) {
                        const content: string = accumulatedChunks.content.toString();
                        let logUri = settings[1] ? logger.log(`Prompted ${message.model}:\n${content}\n`) : "";
                        historyManager.addReply(content, message.model);
                        webview.postMessage({
                            command: 'add_message',
                            message: {
                                messageId: messageId,
                                reply: content,
                                report: accountingManager.getOutputReport(accumulatedChunks, message.model),
                                type: 'reply',
                                showPrice: settings[0],
                                prompt: message.prompt,
                                logUri
                            },
                        });
                        return;
                    }

                    webview.postMessage({
                        command: 'add_message',
                        message: {
                            messageId: messageId,
                            reply: accumulatedChunks.content.toString(),
                            prompt: message.prompt,
                            sender: `💡 ${message.model}`,
                            type: 'reply',
                            showPrice: settings[0],
                        },
                    });

                    // Receive the rest of the chunks
                    while (true) {
                        let chunk = await response.next();
                        if (chunk.value === undefined) {
                            break;
                        }
                        accumulatedChunks = accumulatedChunks.concat(chunk.value);

                        const msg = accumulatedChunks.content.toString();

                        webview.postMessage({
                            command: 'update_message',
                            message: {
                                messageId: messageId,
                                reply: msg,
                            }
                        });
                        if (chunk.done) {
                            break;
                        }
                    }

                    let final = cleanReply(accumulatedChunks.content.toString());

                    // Post-process the final message
                    const postProcessPath = message.prompt.postProcess;
                    if (postProcessPath) {
                        const rendered = await this.promptManager.renderPromptFromPath(
                            postProcessPath,
                            { reply: final }
                        );
                        if (rendered) {
                            final = rendered.user;
                        } else {
                            vscode.window.showErrorMessage(`Could not find post-process prompt: '${postProcessPath}'.`);
                        }
                    }

                    let logUri = settings[1] ? logger.log(`Prompted ${message.model}:\n${final}\n`) : "";
                    historyManager.addReply(final, message.model);

                    // Update the message a last time, with logURI
                    webview.postMessage({
                        command: 'replace_message',
                        message: {
                            sender: `💡 ${message.model}`,
                            messageId: messageId,
                            reply: final,
                            report: accountingManager.getOutputReport(accumulatedChunks, message.model),
                            type: 'reply',
                            showPrice: settings[0],
                            prompt: message.prompt,
                            logUri
                        }
                    });
                    break;

                case 'render_prompt':
                    // Check for active Lean extension and active Lean editor
                    if (!isLean4ExtensionLoaded()) {
                        vscode.window.showErrorMessage('Wait for the Lean 4 extension to load.');
                        return;
                    }

                    if (!hasCurrentLeanEditor()) {
                        vscode.window.showErrorMessage('No active Lean editor found. Please open a .lean file.');
                        return;
                    }

                    let prompt = message.prompt;
                    if (message.path) {
                        const promptPath = path.resolve(path.dirname(prompt.path), message.path);
                        prompt = await this.promptManager.getPrompt(promptPath);
                        if (!prompt) {
                            vscode.window.showErrorMessage(`Could not find prompt: '${message.path}'.`);
                            return;
                        }
                    }
                    const rendered = await this.promptManager.renderPrompt(prompt);

                    let logUri2 = "";
                    if (settings[1]) {
                        let logMsg = `Rendered ${prompt.shortPath}\n`;
                        logMsg += rendered.system ? `System:\n${rendered.system}\nPrompt:\n${rendered.user}\n` : `${rendered.user}\n`;
                        logUri2 = logger.log(logMsg);
                    }
                    historyManager.addPrompt(rendered);
                    webview.postMessage({
                        command: 'add_message',
                        message: {
                            sender: '📜 Lean Scribe',
                            title: `Rendered prompt '${prompt.shortPath}'.`,
                            prompt: prompt,
                            rendered,
                            report: accountingManager.getPromptReport(rendered),
                            logUri: logUri2,
                            type: 'prompt',
                            showPrice: settings[0],
                        },
                    });
                    break;

                case 'full_report':
                    const fullReport = accountingManager.getPromptReport(message.rendered, true);
                    webview.postMessage({
                        command: 'add_message',
                        message: {
                            sender: '📜 Lean Scribe',
                            title: 'All available models',
                            rendered: message.rendered,
                            report: fullReport,
                            type: 'full_report',
                            showPrice: settings[0],
                            prompt: message.prompt,
                        },
                    });
                    break;

                case 'search_prompt':
                    const prompts = await this.promptManager.searchPrompt(message.input);
                    webview.postMessage({ command: 'update_suggestions', prompts });
                    break;

                case 'open_log':
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(message.logUri));
                    break;

                case 'paste_to_editor':
                    const editor = await loadMostRecentLeanTextEditor();
                    if (editor) {
                        editor.edit((editBuilder) => {
                            const selection = editor.selection;
                            const content = message.content.trim();
                            selection.isEmpty
                                ? editBuilder.insert(selection.start, content)
                                : editBuilder.replace(selection, content);
                        });
                    }
                    break;

                case 'undo':
                    const editorUndo = await loadMostRecentLeanTextEditor();
                    if (editorUndo) {
                        await vscode.window.showTextDocument(editorUndo.document);
                        await vscode.commands.executeCommand('undo');
                    }
                    break;

                case 'refresh_scribe':
                    this.refreshScribe();
                    vscode.window.showInformationMessage('Reloaded: Prompt search, models.json and .env');
                    break;
            }
        });
    }

    private refreshScribe() {
        loadWorkspaceEnv();
        configManager.loadConfig();
        accountingManager.loadConfig();
        chatModerator.reloadModels();
        this.promptManager.indexAllPrompts();
    }
}
