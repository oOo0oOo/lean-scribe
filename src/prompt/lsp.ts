import * as vscode from "vscode";
import { escapeCodeBlocks, formatRange, urisToWorkspacePaths } from "../utils";

class LSPClient {
    private static instance: LSPClient;
    public lean4Extension: any;
    public editorApi: any;

    constructor() {
        this.loadLean4Extension();
    }

    public static getInstance(): LSPClient {
        if (!LSPClient.instance) {
            LSPClient.instance = new LSPClient();
        }
        return LSPClient.instance;
    }

    public async getEditorApi(): Promise<any> {
        if (!this.editorApi) {
            await this.loadLean4Extension();
        }
        return this.editorApi;
    }

    private async loadLean4Extension() {
        const lean4Extension = vscode.extensions.getExtension("leanprover.lean4");
        if (!lean4Extension) {
            vscode.window.showErrorMessage("Lean 4 extension is not installed");
            return;
        }
        this.lean4Extension = await lean4Extension.exports.lean4EnabledFeatures;

        if (!this.lean4Extension) {
            vscode.window.showErrorMessage("Lean 4 extension is not loaded");
            return;
        }
        this.editorApi = this.lean4Extension.infoProvider.editorApi;
    }
}

const lspClient = LSPClient.getInstance();

export function isLean4ExtensionLoaded(): boolean {
    return !!lspClient.editorApi;
}

export class LSPDocumentClient {
    private documentUri: string = "";
    private documentUriVSCode: vscode.Uri | undefined;
    private editorApi: any;

    constructor() { }

    async initialize(editor: vscode.TextEditor) {
        this.documentUriVSCode = editor.document.uri;
        this.documentUri = this.documentUriVSCode.toString();
        this.editorApi = await lspClient.getEditorApi();
    }

    private async request(method: string, params: any): Promise<any> {
        return this.editorApi.sendClientRequest(
            this.documentUri,
            method,
            {
                textDocument: { uri: this.documentUri },
                ...params
            }
        );
    }

    async requestPos(method: string, line: number, character: number): Promise<any> {
        return this.request(method, { position: { line, character } });
    }

    // Get diagnostics for the current document
    async getDiagnostics(): Promise<vscode.Diagnostic[]> {
        return vscode.languages.getDiagnostics(this.documentUriVSCode || vscode.Uri.parse(this.documentUri));
    }

    // Custom methods
    async getGoal(line: number, character: number): Promise<string> {
        const goal = await this.requestPos("$/lean/plainGoal", line, character);
        return goal?.rendered;
    }

    async getTermGoal(line: number, character: number): Promise<string> {
        const goal = await this.requestPos("$/lean/plainTermGoal", line, character);
        if (!goal) {
            return "no term goal";
        }
        return "```lean\n" + goal?.goal + "\n```";
    }

    // LSP
    async getHover(line: number, character: number): Promise<any> {
        const hover = await this.requestPos("textDocument/hover", line, character);
        if (!hover) return "";
        return hover.contents.value + "\n" + formatRange(hover.range);
    }

    async getDocumentSymbols(): Promise<string[]> {
        const symbols = await this.request("textDocument/documentSymbol", {});
        const extractNames = (symbols: any[], parentName: string = ''): string[] => {
            return symbols.flatMap((symbol: any) => {
                if (!symbol.name || symbol.name === "<section>") {
                    return symbol.children ? extractNames(symbol.children, parentName) : [];
                }
                const fullName = parentName ? `${parentName}.${symbol.name}` : symbol.name;
                if (symbol.children && symbol.children.length > 0) {
                    return [fullName, ...extractNames(symbol.children, fullName)];
                }
                return [fullName];
            });
        };
        return [...new Set(extractNames(symbols))];
    }

    async getImportUrisUnreliable(): Promise<string[]> {
        // Unfortunately this is not reliable. Not all `import` folding ranges found: E.g. Mathlib/Analysis/Convex/EGauge.lean
        // Find the first section [kind: imports], get definition uri for each line
        const importUris: string[] = [];
        const ranges = await this.request("textDocument/foldingRange", {});
        if (!ranges) {
            return [];
        }

        for (const range of ranges) {
            if (range.kind === "imports") {
                for (let line = range.startLine; line <= range.endLine; line++) {
                    const definition = await this.requestPos("textDocument/definition", line, 10);
                    importUris.push(definition[0].targetUri);
                }
            }
        }
        return [...new Set(importUris)];
    }

    async getImportUris(): Promise<string[]> {
        const fileUri = this.documentUriVSCode ?? vscode.Uri.parse(this.documentUri);
        const fileText = (await vscode.workspace.fs.readFile(fileUri)).toString();

        const matches = [...fileText.matchAll(/^import\s+([^\s]+)/gm)];
        const uris = await Promise.all(
            matches.map(async (match) => {
                const line = fileText.substring(0, match.index!).split('\n').length - 1;
                const lineStart = fileText.lastIndexOf('\n', match.index!);
                const baseColumn = lineStart === -1 ? match.index! : match.index! - (lineStart + 1);
                const character = baseColumn + match[0].indexOf(match[1]);
                const definition = await this.requestPos("textDocument/definition", line, character);
                return definition?.[0]?.targetUri;
            })
        );

        return [...new Set(uris.filter((uri): uri is string => !!uri))];
    }

    async getImportFiles(importUris: string[]): Promise<string[]> {
        // Content of each import file
        const importFiles: string[] = [];
        for (const uri of importUris) {
            const file = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
            let fileText = file.toString();
            importFiles.push(escapeCodeBlocks(fileText));
        }
        return importFiles;
    }

    async getImportFilesFormatted(): Promise<string> {
        let importUris = await this.getImportUris();
        const importFiles = await this.getImportFiles(importUris);
        const paths = urisToWorkspacePaths(importUris);
        let md = "";
        for (let i = 0; i < paths.length; i++) {
            md += `${paths[i]}\n\`\`\`lean\n${importFiles[i]}\n\`\`\`\n`;
        }
        return md;
    }
}