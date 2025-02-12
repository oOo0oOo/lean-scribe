import * as vscode from 'vscode';
import * as fs from 'fs';


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

export function cleanUpReply(text: string): string {
    // Remove markdown code block if the whole answer is wrapped in it
    if (text.startsWith('```markdown') && text.endsWith('```')) {
        text = text.slice(11, -3);
    }

    // Replace lean4 code blocks with lean code blocks
    text = text.replace(/```lean4/g, '```lean');

    return text;
}