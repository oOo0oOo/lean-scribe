function addLineNumbers(code: string, aligned: boolean = true, separator: string = ": ", start_index: number = 0): string {
    let lines = code.split('\n');
    lines = lines.map((line, index) => `${index + start_index}${separator}${line}`);

    if (aligned) {
        let maxDigits = String(lines.length).length;
        // Left pad each line with spaces, to compensate for maxDigits.
        for (let i = 0; i < lines.length; i++) {
            const digitsNeeded = maxDigits - String(i).length;
            if (digitsNeeded > 0) {
                lines[i] = ' '.repeat(digitsNeeded) + lines[i];
            } else {
                // Nobody needs padding.
                break;
            }
        }
    }
    return lines.join('\n');
}

export function strToMarkDown(code: string): string {
    if (code.startsWith("```lean")) {
        return code;
    }
    return "```lean\n" + code + "\n```\n";
}

// Remove complete initial comment (authors, license, etc.)
export function removeInitialComment(code: string): string {
    return code.replace(/\/-\n([\s\S]*?)\n-\/\n/, '');
}

export function contains(str: string, substring: string): boolean {
    return str.includes(substring);
}

export function removeTag(code: string, start: string, end: string): string {
    return code.replace(new RegExp(start + '[\\s\\S]*?' + end, 'g'), '');
}

export function selectTag(code: string, start: string, end: string): string {
    const regex = new RegExp(start + '([\\s\\S]*?)' + end);
    const match = code.match(regex);
    return match ? match[1] : '';
}

export function setupCustomFilters(env: any): void {
    env.addFilter('line_numbers', addLineNumbers);
    env.addFilter('md', strToMarkDown);
    env.addFilter('remove_initial_comment', removeInitialComment);
    env.addFilter('contains', contains);
    env.addFilter('remove_tag', removeTag);
    env.addFilter('select_tag', selectTag);
}