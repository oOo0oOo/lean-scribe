import * as vscode from 'vscode';
import * as fs from 'fs';
import path from 'path';


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
                    process.env[key.trim()] = val;
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


export function removeScribeFolderPath(path: string): string {
    return path.replace(getScribeFolderPath() + "/", "");
}


export function countTokens(text: string): number {
    return text.length / 3; // Scientifically proven
}


export function formatDiagnostics(diagnostics: vscode.Diagnostic[]): string[] {
    const warnings: string[] = [];
    const errors: string[] = [];
    const infos: string[] = [];

    for (const { message, range, severity } of diagnostics) {
        const rangeText = formatRange(range);
        const diagnosticMsg = `${message}\n${rangeText}\n\n`;
        switch (severity) {
            case 0:
                errors.push(diagnosticMsg);
                break;
            case 1:
                warnings.push(diagnosticMsg);
                break;
            case 2:
                infos.push(diagnosticMsg);
                break;
        }
    }
    return [errors.join('\n'), warnings.join('\n'), infos.join('\n')];
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