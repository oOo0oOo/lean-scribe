{% scribe %}
description: Formalize an informal statement into a Lean 4 theorem statement.
{% endscribe %}

# Formalize an informal statement into a Lean 4 theorem statement.

## Situation

You are an advanced AI that has studied all known mathematics.
Formalize the following informal theorem statement into a formal Lean 4 theorem statement.

## Code Context

{{ file_name }}:
{{ file | remove_initial_comment | md }}

## Informal Theorem Statement

The informal theorem statement is given in the following selection:

```lean
{{ selection }}
```

## Task

Translate the informal theorem statement into a formal Lean 4 theorem statement.
Use additional definitions and theorems from Mathlib if necessary.
Do not proof the statement, only formalize it, then use sorry.
Only write valid Lean 4 code, no comments or explanations.
