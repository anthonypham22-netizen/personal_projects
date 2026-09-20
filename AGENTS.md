<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent routing and technical-work defaults

- The main agent defaults to GPT-5.6 Sol with High reasoning: `model = "gpt-5.6-sol"` and `model_reasoning_effort = "high"`.
- When delegating work to a subagent, default to GPT-5.6 Luna with Extra High reasoning: `model = "gpt-5.6-luna"` and `model_reasoning_effort = "xhigh"`. Carry this default into every subagent dispatch unless the user explicitly requests another model or reasoning level.
- The main agent or orchestrator that spawned subagents owns the final quality bar: reconcile their outputs, perform QA and review of the complete result, and resolve any issues before finalizing.
- For any technical work, consult and defer to the current guidance and capabilities of all three preferred resources before making implementation decisions. Use the applicable workflow from each; if one has no relevant guidance or capability, note that briefly and continue:
  - [Compound Engineering](https://github.com/everyinc/compound-engineering-plugin) for the engineering workflow, planning, implementation, review, and compounding learnings.
  - [UI Skills CLI](https://www.ui-skills.com/cli) for UI and frontend work; use its registry routing and fetch commands to select the smallest relevant skill.
  - [Composio toolkits](https://composio.dev/toolkits) for integrations and external-tool workflows; use an appropriate toolkit when one exists.
- Treat these resources as preferred authorities for technical decisions, while following the user's current instructions and any more-specific project guidance.
