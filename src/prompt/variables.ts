import * as vscode from 'vscode';
import * as fs from 'fs';

import { strToMarkDown as strToMarkdown } from './filters';
import { LSPDocumentClient } from './lsp';
import { Prompt } from './manager';
import { escapeCodeBlocks, formatDiagnostics, getScribeFolderPath, urisToWorkspacePaths } from '../utils';
import { historyManager } from '../history';
import { getSystemDiagnostics } from './systemDiagnostics';


// Dirty, pull this upwards as soon as the currentLeanEditor is required elsewhere.
let currentLeanEditor: vscode.TextEditor = vscode.window.activeTextEditor!;

vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor?.document.languageId === 'lean4') {
        currentLeanEditor = editor;
    }
});

export function hasCurrentLeanEditor(): boolean {
    return !!currentLeanEditor;
}

// Prepare variables for context-aware prompt rendering
export async function prepareAllPromptVariables(prompt: Prompt): Promise<any> {
    const required = extractPromptVariables(prompt.path);
    const variables: any = {};
    const leanFile = currentLeanEditor.document;
    let leanText = leanFile.getText();
    // ATTENTION: Modifying leanText here
    leanText = escapeCodeBlocks(leanText);

    const cursor = currentLeanEditor.selection.active;
    const cursorPos = [cursor.line, cursor.character];

    const lsp = new LSPDocumentClient();
    await lsp.initialize(currentLeanEditor);

    // Do diagnostics if any "diagnostics", "errors", "warnings", "infos" are required
    const reqDiagnostics = ['diagnostics', 'errors', 'warnings', 'infos'];
    let diagnostics: string[] = [];
    if (required.some(r => reqDiagnostics.includes(r))) {
        const diag = await lsp.getDiagnostics();
        diagnostics = formatDiagnostics(diag);
        variables['errors'] = diagnostics[0];
        variables['warnings'] = diagnostics[1];
        variables['infos'] = diagnostics[2];
    }

    for (const varName of required) {
        switch (varName) {
            // Current open file
            case 'file_md':
                variables['file_md'] = strToMarkdown(leanText);
                break;
            case 'file':
                variables['file'] = leanText;
                break;
            case 'file_before_cursor':
                variables['file_before_cursor'] = leanText.slice(0, leanFile.offsetAt(cursor));
                break;
            case 'file_after_cursor':
                variables['file_after_cursor'] = leanText.slice(leanFile.offsetAt(cursor));
                break;
            case 'file_path':
                variables['file_path'] = leanFile.fileName;
                break;
            case 'file_name':
                variables['file_name'] = leanFile.fileName.split('/').pop();
                break;

            // System
            case 'system_diagnostics':
                const setup = await getSystemDiagnostics();
                variables['system_diagnostics'] = Object.entries(setup)
                    .map(([key, value]) => `* ${key}: ${value}`)
                    .join('\n');
                break;

            // History
            case 'reply':
                // Last message if it was a reply
                const last = historyManager.getHistoryItem(0);
                if (last?.model) {
                    variables['reply'] = last.text;
                } else {
                    variables['reply'] = '';
                }
                break;
            case 'replies':
                // All replies since the last prompt
                const replies = [];
                while (true) {
                    const item = historyManager.getHistoryItem(replies.length);
                    if (!item || !item.model) break;
                    replies.push(item.text);
                }
                variables['replies'] = replies;
                break;

            // Editor
            case 'cursor':
                variables['cursor'] = `l${cursorPos[0]}:c${cursorPos[1]}`;
                break;
            case 'selection':
                variables['selection'] = leanFile.getText(currentLeanEditor.selection);
                break;

            // Diagnostics (verbose)
            case 'diagnostics':
                const [errors, warnings, infos] = diagnostics;
                if (!errors && !warnings && !infos) {
                    variables['diagnostics'] = 'No diagnostics found, great!';
                } else {
                    variables['diagnostics'] = [
                        errors ? `**Errors**\n\n${errors}\n` : '',
                        warnings ? `**Warnings**\n\n${warnings}\n` : '',
                        infos ? `**Infos**\n\n${infos}\n` : ''
                    ].filter(Boolean).join('\n');
                }
                break;

            // LSP: Lean4 custom
            case 'goal':
                variables['goal'] = await lsp.getGoal(cursorPos[0], cursorPos[1]);
                break;
            case 'term_goal':
                variables['term_goal'] = await lsp.getTermGoal(cursorPos[0], cursorPos[1]);
                break;
            case 'sorry_goals':
                const sorryGoals = await lsp.getSorryGoals();
                variables['sorry_goals'] = sorryGoals;
                break;

            // LSP
            case 'hover':
                variables['hover'] = await lsp.getHover(cursorPos[0], cursorPos[1]);
                break;
            case 'hover_all':
                const hoverAll = await lsp.getHoverAll();
                variables['hover_all'] = hoverAll;
                break;

            case 'import_paths':
                const res = await lsp.getImportUris();
                variables['import_paths'] = urisToWorkspacePaths(res).join("\n");
                break;
            case 'import_files_md':
                const importFileFormatted = await lsp.getImportFilesFormatted();
                variables['import_files_md'] = importFileFormatted;
                break;
            case 'symbols':
                const symbols = await lsp.getDocumentSymbols();
                variables['symbols'] = symbols;
                break;
        }
    }
    return variables;
};

const varPattern = /{{\s*([^|}\s]+)\s*(?:\|[^}]+)?\s*}}/g;
const extendPattern = /{%\s+extends\s+["'](.*)["']\s+%}/;

function extractPromptVariables(path: string): string[] {
    // Collect all required variables in the prompt file.
    // Will be called recursively for now.
    const file = fs.readFileSync(path, 'utf8');

    // Find all variables required in the file.
    const matches = file.matchAll(varPattern);
    const variables = Array.from(matches, m => m[1]);

    // Find whether the file extends another file.
    // {% extends "path/to/file" %}
    const extendMatch = file.match(extendPattern);
    if (extendMatch) {
        const path = getScribeFolderPath() + '/' + extendMatch[1];
        const extraVars = extractPromptVariables(path);
        variables.push(...extraVars);
    }

    return [...new Set(variables)];
}