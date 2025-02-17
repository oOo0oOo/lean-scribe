import { historyManager } from "../history";


class ScribeExtension {
    tags = ['scribe'];

    parse(parser: any, nodes: any, lexer: any) {
        var tok = parser.nextToken();
        var args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        parser.parseUntilBlocks('endscribe');
        parser.advanceAfterBlockEnd();
        return new nodes.CallExtension(this, 'run', args, []);
    };

    run(context: any) {
        return "";
    };
}


class PromptExtension {
    tags = ['prompt'];

    parse(parser: any, nodes: any, lexer: any): any {
        const tok = parser.nextToken();
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        return new nodes.CallExtension(this, 'run', args);
    }

    run(context: any, path: string, label: string): string {
        return `<button class="trigger-prompt-button button-element px-2 py-1 rounded" data-path="${path}">${label}</button>`;
    }
}


const getHistoryItem = (index: number): string => historyManager.getHistoryItem(index)?.text || "";


export function setupNunjucksEnvironment(env: any): void {
    env.addExtension('ScribeExtension', new ScribeExtension());
    env.addExtension('PromptExtension', new PromptExtension());
    env.addGlobal('history', getHistoryItem);
}
