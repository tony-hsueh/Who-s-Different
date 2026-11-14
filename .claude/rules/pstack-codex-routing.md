# pstack: route the `codex` role to OpenAI Codex

This rule overrides one row of the pstack Claude Code adapter (`docs/harness/claude-code.md`, Models table): the row that says a non-Claude slug runs on the session model.

- When a pstack role line or panel entry in `pstack-models.md` starts with `codex`, spawn that seat with `Agent`, `subagent_type: "codex-runner"`, and no `model`. Do not run it on the session model.
- The entry is `codex <model> <effort>`, e.g. `codex gpt-6.1-sol high`. The word after `codex` is the OpenAI model, the last word is the reasoning effort. A bare `codex` means `codex gpt-6.1-sol high`.
- When a skill falls back to a default `grok-*`, `gpt-*`, or `composer-*` slug because a role line is missing, treat it as `codex gpt-6.1-sol high`.
- `codex` is its own model family, different from every `claude-*`, `opus`, `sonnet`, `haiku`, and `fable` model. Sonnet and Opus are the same family.
- So whenever a skill asks for a reviewer, judge, or verifier "from a different model family" than a Claude parent or a Claude author (arena cross-judge, orchestrate and autopilot verifiers, shipping verdicts, show-me-your-work reviewer, eval judge), use `codex-runner`.
- The brief you give `codex-runner` is the full brief you would give any other subagent. Add these lines at the top:
  - `WORKDIR: <absolute path>` (the worktree or directory the seat works in; create the worktree first with `git worktree add` when the skill asks for isolation),
  - `MODE: read-only` or `MODE: write`,
  - `MODEL: <model>` and `EFFORT: <effort>` from the role entry,
  - `OUTPUT: <absolute path>` when the skill names an output location.
- Review what Codex returns the same way you review any subagent: read the diff or rerun the command. Its report is not a verdict.
- If `codex-runner` reports that Codex failed or is not installed, say so in one line and run that seat on the session model, as the adapter would.
