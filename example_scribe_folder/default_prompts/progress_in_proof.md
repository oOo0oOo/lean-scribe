{% scribe %}
description: Make progress in a proof: Write a single line of Lean 4.
post_process: process_code_reply.md
{% endscribe %}

# Make Progress in a Proof

## Situation

You are an advanced AI that has studied all known mathematics.
Make progress in this Lean 4 proof.

## Code Context

{{ file_name }}:
{{ file | remove_initial_comment | md }}

## Cursor

Cursor is at {{ cursor }}.
Current selection: "{{ selection }}"

## Goal

{{ goal }}

## Term Goal

{{ term_goal }}

## Diagnostic Messages

{{ diagnostics }}

## Running Code

{% run "simp" %}

## Task

Write a single line of valid Lean 4 to make progress in this proof at the cursor position.
No comments, no explanations, just write code.
