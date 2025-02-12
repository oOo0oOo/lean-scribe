import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { PromptManager } from './prompt/manager';
import { accountingManager } from './accounting';
import { chatModerator } from './chat/moderator';
import { logger } from './logger';
import { getPriceAndLoggingSettings, loadMostRecentLeanTextEditor, loadWorkspaceEnv, cleanUpReply } from './utils';
import { historyManager } from './history';
import { AIMessageChunk } from '@langchain/core/messages';
import { configManager } from './configManager';

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
            // Get current setting for scribe folder
            let scribeFolder = vscode.workspace.getConfiguration('lean-scribe').get<string>('scribeFolder');

            // If no current setting: Use homedir + scribe as default folder
            if (!scribeFolder) {
                scribeFolder = path.join(require('os').homedir(), 'scribe');
                // Create empty folder if it doesn't exist
                if (!fs.existsSync(scribeFolder)) {
                    fs.mkdirSync(scribeFolder);
                }
            }

            // Ask user to select a folder
            const folderPath = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select scribe folder',
                defaultUri: vscode.Uri.file(scribeFolder)
            });

            if (!folderPath) {
                return;
            }

            // Update setting
            vscode.workspace.getConfiguration('lean-scribe').update('scribeFolder', folderPath[0].fsPath, true);

            // Delete created folder if it is empty and not selected
            if (scribeFolder !== folderPath[0].fsPath) {
                if (fs.readdirSync(scribeFolder).length === 0) {
                    fs.rmdirSync(scribeFolder);
                }
            }
        });
        this.context.subscriptions.push(setup_cmd);

        const cmd = vscode.commands.registerCommand('lean-scribe.openLeanScribe', () => {
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

                    const final = cleanUpReply(accumulatedChunks.content.toString());
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
                    const prompt = message.path
                        ? await this.promptManager.getPrompt(
                            path.resolve(path.dirname(message.prompt.path), message.path)
                        )
                        : message.prompt;
                    const rendered = await this.promptManager.renderPrompt(prompt.path);
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
                    await configManager.loadConfig();
                    await this.promptManager.indexAllPrompts();
                    await loadWorkspaceEnv();
                    vscode.window.showInformationMessage('Refreshed: Prompt search, models.json and .env');
                    break;
            }
        });
    }
}
