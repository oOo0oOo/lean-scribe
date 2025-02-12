// Setup nunjucks environment
import * as nunjucks from 'nunjucks';
import { getScribeFolderPath } from '../utils';
import { setupNunjucksEnvironment } from './nunjuckExtensions';
import { setupCustomFilters } from './filters';

const scribePath = getScribeFolderPath();
const nunjucksEnv = nunjucks.configure([scribePath], { autoescape: false });
setupNunjucksEnvironment(nunjucksEnv);
setupCustomFilters(nunjucksEnv);


import { Prompt, RenderedPrompt } from './manager';
import { prepareAllPromptVariables } from './variables';

// Extract system message [[system]]...[[system]]
const systemRegex = /\[\[\s*system\s*\]\]\s*([\s\S]*?)\s*\[\[\s*system\s*\]\]/;

export async function renderPrompt(prompt: Prompt): Promise<RenderedPrompt> {
    const followUp = prompt.followUp;
    const variables = await prepareAllPromptVariables(prompt);
    // const rendered = nunjucksEnv.render(prompt.path, variables); // This has some kind of cache!! Doesn't always reload...
    const rendered = nunjucksEnv.renderString(prompt.template, variables);

    // Separate system message and user message
    const systemMatch = systemRegex.exec(rendered);
    if (systemMatch) {
        // Remove exactly the match from rendered
        const system = systemMatch[1].trim();
        const user = rendered.replace(systemMatch[0], "").trim();
        return { user, system, followUp };
    } else {
        const user = rendered.trim();
        return { user, followUp };
    }

}
