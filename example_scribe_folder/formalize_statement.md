{% scribe "Formalize the statement of the theorem from the given informal comment." %}

# Formalize a Lean 4 Theorem Statement

## Situation

You are an advanced AI that has studied any known mathematics.
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
Only write valid Lean 4 code, no comments or explanations.
