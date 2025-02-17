import { randomUUID } from "crypto";
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


class RunExtension {
    tags = ['run'];

    parse(parser: any, nodes: any, lexer: any): any {
        const tok = parser.nextToken();
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        return new nodes.CallExtension(this, 'run', args);
    }

    run(context: any, code: string): string {
        const variable = `run_${code}`;
        const ctx = context.ctx;
        if (variable in ctx) {
            return ctx[variable];
        }
        return "";
    }
}


const getHistoryItem = (index: number): string => historyManager.getHistoryItem(index)?.text || "";
const getUuid = (): string => randomUUID();


export function setupNunjucksEnvironment(env: any): void {
    env.addExtension('ScribeExtension', new ScribeExtension());
    env.addExtension('PromptExtension', new PromptExtension());
    env.addExtension('RunExtension', new RunExtension());
    env.addGlobal('history', getHistoryItem);
    env.addGlobal('uuid', getUuid);
}
