# Lean Scribe

Lean Scribe is a VSCode extension for rendering and running context-rich Lean 4 prompts

## Features

### Render context-rich prompts

![Render context-rich prompts](https://github.com/oOo0oOo/lean-scribe/blob/main/screenshots/render_prompts.png)

### Query multiple state-of-the-art large language models

![Query multiple state-of-the-art models](https://github.com/oOo0oOo/lean-scribe/blob/main/screenshots/multiple_llms.png)

### Define prompts as shareable markdown files with variables

![Define prompts as markdown files](https://github.com/oOo0oOo/lean-scribe/blob/main/screenshots/context_rich_prompts.png)

## Getting Started with Lean Scribe

1. Install the `Lean 4` vscode extension.
2. Install the `Lean Scribe` vscode extension.
3. Setup Lean Scribe folder (`Ctrl+Shift+P` -> `Lean Scribe: Setup Scribe Folder`).
4. Show Lean Scribe (`Ctrl+Shift+P` -> `Lean Scribe: Show`).
5. Render your first prompt!

## Scribe folder

Lean Scribe uses a folder for storage.

Default location is the home directory:

- Linux: `~/scribe/`
- Windows: `C:\Users\username\scribe\`
- MacOS: `/Users/username/scribe/`

The scribe folder contains:

- `models.json` allowing you to configure your models.
- `.env` file for setting ENV variables (optional).
- `logs/` folder for logging (optional).
- All your prompts (`.md` files) in various subfolders.

### Enabling models

Models are automatically enabled, if the correct ENV variable is set.
Update the values in the `scribe_folder/.env` file, or set them yourself.

ATTENTION! NEVER commit this .env file!

## Models

Lean Scribe uses [LangChain](https://js.langchain.com/) for LLM integration and currently supports models from the following providers:

- Anthropic
- Fireworks.ai
- Google
- OpenAI

Models are configured in the `scribe_folder/models.json` file.
You can also set other model params like temperature using the params:

`params = {"model": "gpt-4o-mini", "temperature": 0.9}`

## Prompt Templating

### Introduction

A prompt is stored as a .md file with [jinja formatting](https://mozilla.github.io/nunjucks/templating.html).
Rendering takes a prompt and uses the active .lean file to fill in the variables.
Overall, Jinja templating is quite powerful, you can include or even inherit from other prompts.

Let's look at a simple example:

```jinja
{% scribe "Explain a lean file."}
Explain this lean file to me:
{{ file_md }} 
```

The scribe tag plus a description tell Lean Scribe that this is a valid prompt.
`{{ file_md }}` is a variable that will be replaced with the content of the file in a neat markdown code block.

Let's expand the previous example:

```jinja
{% scribe "Explain a lean file."}

You are an AI that has studied all of known mathematics.

Explain this lean file to me:
{{ file | remove_initial_comment | md }}

Diagnostic messages:
{{ diagnostics }}

Find key theorems (code) and give concise explanations.
Reply concisely and distill to the essence.
```

We are now using `filters` to process a variable before rendering.
`file` is the raw text of the file, `remove_initial_comment` and `md` are applied in that order.

Read more about templating below, or check out the [example prompts](https://github.com/oOo0oOo/lean-scribe/tree/main/example_scribe_folder).

## {% scribe "" %} tag

Signify a valid prompt.

```jinja
{% scribe "Prompt description", "follow-up.md" %}
```

- The first argument is the prompt description.
- The second argument is an optional follow-up prompt (relative to the current prompt).

## Variables

- **file_md**: File text wrapped in \`\`\`lean markdown syntax.
- **file**: Raw text of the file.
- **file_before_cursor**: File text before the editor cursor.
- **file_after_cursor**: File text after the editor cursor.
- **file_path**: Full file path on the system.
- **file_name**: Filename only, without directories.
- **cursor**: Current cursor position in the file (line:column).
- **selection**: Currently selected text in the editor.
- **diagnostics**: Collated error, warning, and info messages.
- **goal**: Lean4 proof goal at the current cursor position.
- **term_goal**: Lean4 term goal at the current cursor position.
- **hover**: Hover information from the language server.
- **import_paths**: Mapped import URIs to workspace paths.
- **import_files_md**: Formatted import text for MD output.
- **symbols**: Document symbols for the current file.
- **history(n)**: n >= 0. The nth most recent message (only prompts and replies).
- **reply**: The last reply message.
- **replies**: All replies since the last prompt.
- **system_diagnostics**: System diagnostics information.

## Filters

Many filters are already built-in in nunjucks (jinja in typescript), see [here](https://mozilla.github.io/nunjucks/templating.html#builtin-filters).

Additional custom filters in Lean Scribe:

### line_numbers

`line_numbers(aligned: boolean = true, separator: string = ": ", start_index: number = 0)`

Prefix code with line numbers, optionally aligned.

### md

Wrap text in \`\`\`lean code block.

### remove_initial_comment

Remove the initial comment block from the file.

### contains

`contains(substring: string)`

Check if a string contains another string. Example usage

```jinja
{% if {history(0)} | contains("```lean") %}
The last message contained a code block.
{% endif %}
```

### remove_think

Remove the content in the `<think>` tags `</think>`. This is typically returned by Deepseek R1.

## Misc

### System Prompt

Use the `[[system]]` tag in your prompt:

```jinja
[[system]]
You are an advanced AI that has studied all known mathematics.
Your specialty is exactly this file: {{ file_name }}
[[system]]
```

NOTE: System prompts are not available on some models like "OpenAI o1".

### Reference other prompt

Use the `prompt` tag to reference another prompt.
This creates a button, which will render that prompt.

```jinja
{% prompt "explain_lean.md", "Run this again" %}
```

NOTE: For now, the HTML for this button is part of the sent prompt.

## Settings (VSCode)

Lean Scribe has a few settings that can be configure via VSCode settings.
You can set these for a user or for each workspace separately.

`Ctrl+Shift+P` -> `Preferences: Open User Settings` -> Search "Lean Scribe"

### Scribe Folder

Set the scribe folder location. It is recommended that you set up the scribe folder via the command `Lean Scribe: Setup Scribe Folder` and not change this setting manually.

### Acknowledge Price Unreliable

If you want to see price information you need to acknowledge that it might be unreliable.

### Code Color Scheme

Color scheme to use for highlighting code blocks in prompts. See [here](https://highlightjs.org/demo).

### Logging

Enable logging prompts and replies to a file. Logs are stored in the `scribe_folder/logs/` directory in daily files and can get quite large.
