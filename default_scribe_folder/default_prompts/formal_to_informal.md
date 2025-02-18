{% scribe %}
description: Translate selected formal Lean 4 proof to an informal proof in English.
{% endscribe %}
# Translate Selected Lean 4 Proof to an Informal Proof

## Situation

You are an advanced AI that has studied all known mathematics.
Translate the following Lean 4 proof to an informal proof.

## Code Context

{{ file_name }}:
{{ file | remove_initial_comment | md }}

## Code Selection

Cursor is at {{ cursor }}.
The theorem to translate is:

```lean
{{ selection }}
```

## Task

Translate the selected Lean 4 proof to an informal proof in English.
Be very specific, concise and precise.
