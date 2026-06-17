## What & why

<!-- What does this change, and why? Link any related issue. -->

## Checklist

- [ ] `npm run build && npm test` pass; added/updated a test for any behavior change
- [ ] No new runtime dependencies (Node stdlib only)
- [ ] Dashboard: any agent-supplied text is rendered via `textContent` (no `innerHTML` on session data)
- [ ] Hook / notify paths still swallow errors and never block an agent
- [ ] Commits are signed off (`git commit -s`) per [CONTRIBUTING](../CONTRIBUTING.md) (DCO)
