import * as vscode from 'vscode';
import * as fs from 'fs';
import path from 'path';
import net from 'net';


export function loadFileInScribeFolder(path: string): string | null {
    const scribeFolder = getScribeFolderUri();
    if (!scribeFolder) {
        return null;
    }
    const filePath = vscode.Uri.joinPath(scribeFolder, path);
    if (fs.existsSync(filePath.fsPath)) {
        return fs.readFileSync(filePath.fsPath, 'utf8');
    }
    return null;
}


const allowedEnvKeys = [
    "ANTHROPIC_API_KEY",
    "FIREWORKS_API_KEY",
    "GOOGLE_API_KEY",
    "OPENAI_API_KEY"
];

export function loadWorkspaceEnv() {
    const envContent = loadFileInScribeFolder('.env');
    if (!envContent) {
        return;
    }

    envContent.split('\n')
        .forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                const val = value.trim();
                if (!val.includes("...")) {
                    const k = key.trim();
                    if (allowedEnvKeys.includes(k)) {
                        process.env[k] = val;
                    }
                }
            }
        });
}


export function loadJSONInScribeFolder(path: string): any | null {
    const response = loadFileInScribeFolder(path);
    if (response) {
        return JSON.parse(response);
    } else {
        console.error(`File not found: ${path}`);
    }
    return null;
}


export async function loadMostRecentLeanTextEditor(): Promise<vscode.TextEditor | undefined> {
    const editors = vscode.window.visibleTextEditors;
    const currentEditor = vscode.window.activeTextEditor;
    if (!editors.length) {
        return;
    }
    // Filter out the current editor and find the most recent one
    return editors.find(editor => editor !== currentEditor && editor.document.languageId === 'lean4');
}


export function getScribeFolderPath(): string | null {
    const scribeFolderUri = getScribeFolderUri();
    if (!scribeFolderUri) {
        return null;
    }
    return scribeFolderUri.fsPath;
}


export function getScribeFolderUri(): vscode.Uri | null {
    // Get scribe folder path from settings
    const config = vscode.workspace.getConfiguration('lean-scribe');
    const scribeFolder = config.get<string>('scribeFolder', 'scribe');

    if (!scribeFolder || !fs.existsSync(scribeFolder)) {
        return null;
    }

    return vscode.Uri.file(scribeFolder);
}

export function resolveRelativePath(pPath: string, relativePath: string): string | undefined {
    const dir = path.dirname(pPath);
    const fullPath = path.resolve(dir, relativePath);
    return fs.existsSync(fullPath) ? fullPath : undefined;
}

export function getPriceAndLoggingSettings(): boolean[] {
    const config = vscode.workspace.getConfiguration('lean-scribe');
    return [config.get<boolean>('acknowledgePriceUnreliable', false), config.get<boolean>('logging', true)];
}

export function removeScribeFolderPath(filePath: string): string {
    const scribeFolderPath = getScribeFolderPath();
    if (!scribeFolderPath) {
        return filePath;
    }
    const normalizedFilePath = path.normalize(filePath);
    const normalizedScribeFolderPath = path.normalize(scribeFolderPath + path.sep);
    if (normalizedFilePath.startsWith(normalizedScribeFolderPath)) {
        return normalizedFilePath.substring(normalizedScribeFolderPath.length);
    }
    return filePath;
}

export function countTokens(text: string): number {
    return text.length / 3; // Scientifically proven
}

export function formatDiagnostics(diagnostics: vscode.Diagnostic[], coordinates: boolean = true): string[] {
    const groups: Record<number, string[]> = { 0: [], 1: [], 2: [] };

    diagnostics.forEach(({ message, range, severity }) => {
        const rangeText = coordinates ? `\n${formatRange(range)}` : '';
        const diagnosticMsg = `${escapeCodeBlocks(message)}${rangeText}\n`;
        groups[severity]?.push(diagnosticMsg);
    });

    const formatGroup = (msgs: string[]) => msgs.map(msg => `- ${msg}`).join('\n');
    return [formatGroup(groups[0]), formatGroup(groups[1]), formatGroup(groups[2])];
}

export function formatRange(range: vscode.Range): string {
    return `[l${range.start.line}:c${range.start.character} - l${range.end.line}:c${range.end.character}]`;
}

// Process semantic tokens
export function processTokens(tokens_raw: number[]): number[][] {
    let tokens: number[][] = [];
    let line = 0;
    let char = 0;
    for (let i = 0; i < tokens_raw.length; i += 5) {
        const d_line = tokens_raw[i];
        const d_char = tokens_raw[i + 1];
        const length = tokens_raw[i + 2];
        const type = tokens_raw[i + 3];
        line += d_line;
        char = d_line ? d_char : char + d_char;
        tokens.push([line, char, length, type]);
    }
    return tokens;
}


export function urisToWorkspacePaths(uris: string[]): string[] {
    // Remove workspace folder from uri
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceFolderUri = workspaceFolder?.uri.toString();
    const workspaceFolderUriLength = workspaceFolderUri?.length || 0;
    return uris.map(uri => uri.slice(workspaceFolderUriLength + 1));
}


export function escapeCodeBlocks(text: string): string {
    // Escape backticks in the lean text to prevent flawed markdown rendering in webview (marked).
    return text.replace(/```/g, '\\`\\`\\`');
}

export function cleanHoverAnnotation(text: string): string {
    // Remove all /--, -/, ***, and unnecessary double newlines
    text = text
        .replace(/\/--/g, "")
        .replace(/\/-/g, "")
        .replace(/--\//g, "")
        .replace(/-\//g, "")
        .replace(/\*\*\*/g, "")
        .replace(/\n\n/g, "\n");

    // Remove all ```lean () ``` code blocks but not the code itself
    text = text.replace(/```lean([\s\S]*?)```/g, '$1');

    // Escape code blocks and trim whitespace
    return escapeCodeBlocks(text).trim();
}

export function cleanReply(text: string): string {
    // Remove markdown code block if the whole answer is wrapped in it
    if (text.startsWith('```markdown') && text.endsWith('```')) {
        text = text.slice(11, -3);
    }

    // Replace lean4 code blocks with lean code blocks
    text = text.replace(/```lean4/g, '```lean');

    return text;
}

export type ScribeBlock = {
    description: string;
    follow_up: string | null;
    post_process: string | null;
    hide: boolean;
}

export function parseScribeBlock(text: string): ScribeBlock | null {
    const scribeBlock = text.match(/{% scribe %}([\s\S]*?){% endscribe %}/);
    if (!scribeBlock) {
        return null;
    }

    const meta = scribeBlock[1].split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            // Split on the first ":"
            const index = line.indexOf(':');
            if (index === -1) {
                return [line, ''];
            }
            const key = line.slice(0, index).trim();
            const value = line.slice(index + 1).trim();
            return [key, value];
        });

    const metaObject = meta.reduce((acc, [key, value]) => {
        switch (key) {
            case 'description':
                acc.description = value;
                break;
            case 'follow_up':
                acc.follow_up = value;
                break;
            case 'post_process':
                acc.post_process = value;
                break;
            case 'hide':
                acc.hide = value === 'true';
                break;
        }
        return acc;
    }, {} as ScribeBlock);

    return metaObject;
}

// OLLAMA SUPPORT
export async function isOllamaRunning(timeout: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        const cleanUp = (result: boolean) => {
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeout);
        socket.once('connect', () => cleanUp(true));
        socket.once('timeout', () => cleanUp(false));
        socket.once('error', () => cleanUp(false));
        socket.connect(11434, '127.0.0.1');
    });
}

export async function getOllamaContextLength(name: string): Promise<number | null> {
    // Also used to check if a model is available
    const response = await fetch('http://localhost:11434/api/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ "model": name })
    });

    if (!response.ok) {
        return null;
    }

    const resp: any = await response.json();
    const model_info: any = resp.model_info;
    const key = Object.keys(model_info).find(k => k.includes('context_length'));
    const value = key ? parseInt(model_info[key], 10) : NaN;
    return isNaN(value) ? null : value;
}

export async function pullOllamaModelIfNecessary(name: string): Promise<void> {
    if (!await isOllamaRunning() || await getOllamaContextLength(name)) {
        return;
    }
    await pullOllamaModel(name);
}

export async function pullOllamaModel(name: string): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Pulling model "${name}"`,
        cancellable: false
    }, async progress => {
        const response = await fetch('http://localhost:11434/api/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: name, stream: true })
        });

        if (!response.body) {
            throw new Error('Response body is empty');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) {
                    continue;
                }
                try {
                    const data = JSON.parse(line);
                    if (data.total && data.completed) {
                        const percent = Math.floor((data.completed / data.total) * 100);
                        progress.report({ message: `Downloading (${percent}%)` });
                    }
                    if (data.status === 'success') {
                        progress.report({ message: `Model "${name}" pulled successfully.` });
                        return;
                    }
                } catch (err) {
                    console.error('Error parsing line:', line, err);
                }
            }
        }
    });
}