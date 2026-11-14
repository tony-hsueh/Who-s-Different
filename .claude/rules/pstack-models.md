# pstack model configuration (Claude Code). One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Agent `model`).
# `codex <model> <effort>` as a value (e.g. `codex gpt-6.1-sol high`): see pstack-codex-routing.md. Spawn the `codex-runner` agent instead of setting `model`.
# Do not rerun /pstack:setup-pstack on this file. It does not know `codex` and will ask you to replace it.
# budget: large (xhigh)
feature, refactoring: sonnet high
bug-fix: sonnet high
perf-issue: sonnet high
hillclimb: sonnet high
judgment and prose: opus xhigh
hardest tasks: opus xhigh
how explorer: codex gpt-6.1-sol high
how explainer: opus xhigh
why investigators: codex gpt-6.1-sol high
why synthesizer: opus xhigh
reflect tooling: codex gpt-6.1-sol high
reflect judgment, divergent, synthesizer: opus xhigh
arena runners: opus xhigh, codex gpt-6.1-sol high
arena cross-judge pool: codex gpt-6.1-sol high, opus xhigh
swarm workers: codex gpt-6.1-sol high
architect runners: opus xhigh, codex gpt-6.1-sol high
interrogate reviewers: opus xhigh, codex gpt-6.1-sol high
