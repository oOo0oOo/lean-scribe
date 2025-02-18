{% scribe %}
description: Refactor and simplify selected code section to make it more understandable and maintainable.
{% endscribe %}

# Refactor Lean 4 Code

## Situation

You are an advanced AI that has studied all known mathematics.
Help me improve the selected Lean 4 code.

## Code Context

{{ file_name }}:
{{ file | remove_initial_comment | md }}

## Code Selection

Cursor is at {{ cursor }}.
The code to refactor is:

```lean
{{ selection }}
```

## Task

Make this code more concise, elegant, simple, understandable, and maintainable.
Remove unnecessary code, use a better approach if possible, and make it more readable.
Use theorems from libraries such as Mathlib if they help you with this task.

Write a few suggestions for improving the code as concise, insightful bullet points.

Then write the refactored code that you would replace the selection with.
Only write valid Lean 4 code, no comments or explanations.
