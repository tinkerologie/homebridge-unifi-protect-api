# Contributing to Homebridge UniFi Protect API Plugin

Thank you for your interest in the Homebridge UniFi Protect API Plugin. This project accepts contributions from human developers and from autonomous AI coding agents.

This Homebridge plugin connects UniFi Protect cameras and sensors to HomeKit.

All contributors must obey the standard development and governance workflow in this document. The workflow keeps the code quality high and protects the time of the maintainers.

---

## Code of Conduct and Standards

- Be respectful, constructive, and collaborative.
- Zero secrets policy: Do not commit passwords, tokens, API keys, private certificates, or personal data.
- Anti-burnout principle: Do all the necessary checks locally before you open a pull request or request a review.

---

## Development Workflow

All contributions from humans and from AI agents must obey this workflow:

### 1. Open a GitHub Issue First
- Start each bug fix, feature, or enhancement with an issue.
- Use the applicable GitHub Issue Form:
  - Bug Report (`01-bug-report.yml`)
  - Enhancement Request (`02-enhancement-request.yml`)
- Blank or unstructured issues are disabled. The maintainers close pull requests that do not have a related issue.

### 2. CodeRabbit AI Plan Generation
- After you create the issue, CodeRabbit AI makes an implementation plan. The `bug` or `enhancement` label starts CodeRabbit automatically. You can also add the comment `@coderabbitai plan` to the issue.
- CodeRabbit examines the codebase and adds a full Coding Plan. The plan contains:
  - Codebase research and the components that the change affects
  - Architectural design decisions
  - Tasks, divided into phases
  - Machine-readable agent prompts and acceptance criteria that you can verify
- Examine, improve, and approve the plan before you write code. Do not start the implementation without an approved plan.

### 3. Create a Dedicated Branch
- Create a feature or bugfix branch from `main`:
  - Features: `git checkout -b feat/<issue-number>-<short-description>`
  - Fixes: `git checkout -b fix/<issue-number>-<short-description>`
  - Documentation: `git checkout -b docs/<issue-number>-<short-description>`
- Do not commit directly to the default branch (`main`).

### 4. Implementation and Local Validation
- Implement the changes. Obey the project conventions and the approved plan.
- In `CHANGELOG.md`, under `## [Unreleased]`, write what changed and why.
- Run all the necessary local validation checks: tests with coverage, linters, type checkers, and formatters. Make sure that all checks pass with zero errors and zero warnings.

### 5. Follow the Pull Request Template
- Use `.github/PULL_REQUEST_TEMPLATE.md` to open a pull request.
- Complete all sections in the template:
  - Summary of changes
  - Linked issue keywords (`Fixes #<issue>`, `Closes #<issue>`, `Addresses #<issue>`)
  - Verification steps and pasted terminal output
  - Mandatory Pre-Submission Governance checklist (check every box)

### 6. Open PR as DRAFT First
- Open all pull requests in Draft mode. Use `gh pr create --draft`, or select "Create draft pull request" in GitHub.
- In a draft PR, the CI workflows run, but GitHub does not send notifications to reviewers. This does not use review capacity that is not necessary.
- Make sure that all CI checks pass in draft mode. Make sure that all the changes operate correctly.

### 7. Mark Ready for Review
- Change the pull request to "Ready for Review" only after all local checks and draft CI checks pass.
- A pull request that is ready for review must not have failed checks, an incomplete template, or changes that you did not verify. If it has one of these problems, the maintainers change it back to draft or close it.

### 8. Automated Quality Gates and Merge Criteria
A pull request must pass all automated quality gates before the merge:
- CodeRabbit AI Review: Resolve or address all review comments and suggestions.
- GitHub Copilot Code Review: Must pass with no blocking feedback.
- Codecov Coverage Reports: Must pass with zero errors, zero warnings, and no coverage decrease below the repository target.
- Branch Ruleset Checks: All necessary status checks in the default branch ruleset must pass.

---

## Local Development and Verification

### Prerequisites and Setup

- Runtime: Node.js 22 or 24 and Homebridge 2.
- Development: Node.js `^22.22.2 || >=24.15.0`. The locked ESLint tooling requires this version.
- npm (`npm ci`)

### Validation Commands

```bash
# Compile TypeScript source
npm run build

# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint/format checks with zero warnings, including source and test type checking
npm run lint

# Parse the plugin UI schema (the UI uses custom schema extensions)
node --input-type=module -e "import fs from 'node:fs'; JSON.parse(fs.readFileSync('config.schema.json', 'utf8'))"
```

The coverage must meet the measured baseline thresholds in `vitest.config.ts`.
CI sends LCOV to Codecov on Node 24. The project status permits no coverage
decrease, and tests must cover the changed lines. Authenticated uploads use the repository
or organization `CODECOV_TOKEN` secret. Uploads from public forks use the tokenless
support of Codecov. To get project and patch statuses, install the Codecov GitHub app.
The current Homebridge UI package supplies `hb-service`. It does not supply a `--schema-check`
command. `npm test` covers the configuration and the custom UI behaviour.

`npm run watch` uses the declared development dependency `nodemon` and
`nodemon.json`. When the source or the configuration schema changes, it rebuilds and restarts `homebridge -I -D`.
For tests with hardware, use a separate Homebridge storage directory for development.

---

## Commit Message Guidelines

We use Conventional Commits:

- `feat(<scope>): <description>` — New feature
- `fix(<scope>): <description>` — Bug fix
- `docs(<scope>): <description>` — Documentation changes
- `test(<scope>): <description>` — Adding or updating tests
- `refactor(<scope>): <description>` — Code restructuring without functional change
- `chore(<scope>): <description>` — Tooling, dependencies, or repository maintenance

---

## Pull Request Governance Summary

- Do not send spam or many PRs one after the other. Put related changes into one PR.
- A human must verify and test AI-assisted PRs locally before submission.
- Confirm all template checkboxes.
- Keep PRs in Draft until you verify them.

## Issue and Pull Request Governance

These rules apply to all contributors, including AI coding agents. The full rules for the organization are in
[GOVERNANCE.md](https://github.com/tinkerologie/.github/blob/main/GOVERNANCE.md).

1. **Issue first.** Before you open a pull request, use the bug or enhancement template to open an issue.
   Keep the title prefix `[Bug]:` or `[Enhancement]:`, then a space and the title.
   If automation can find the type, it adds the `bug` or `enhancement` label. CodeRabbit
   then adds a Coding Plan to the issue. Implement the change from that plan. The labeler does not
   process issues with the labels `question`, `duplicate`, `invalid`, `wontfix`, or `no-type`. It does not
   add a type label again after a maintainer removes it.
2. **Link the issue.** In the **Related Issues** section of the PR, write `Closes #<number>` (or `Fixes`
   or `Resolves`) if the PR fully resolves the issue. These keywords close the issue at the merge.
   For partial work, use `Part of #<number>` or `Related to #<number>`. The linked issue must exist. You can link an
   issue in a different public repository (`owner/repo#123`). Only authors with write access or
   higher (maintainers) can write `None`. They use it for housekeeping, for example CI,
   documentation, or dependency updates. PR governance rejects `None` from all other authors.
3. **One change at a time.** A contributor without write access can have a maximum of 2 open, non-draft
   pull requests in this repository. GitHub enforces this limit. Draft pull requests are not included in the limit.
   Do not open a PR that changes the same files as a different open PR, for example `CHANGELOG.md`,
   translations, `README.md`, or generated bundles. Wait for the first PR to merge. Then rebase and
   continue.
4. **Do the items in the Tinkerologie-Bot report.** When PR governance fails, Tinkerologie-Bot adds one comment.
   The comment shows each problem as a numbered item. To correct each item, edit the PR description or push
   the missing change. The check then runs again, and the comment changes to passed.
5. **Rebase before review.** Rebase on `main` before you mark a PR ready for review.
6. **Resolve conflicts first.** When a PR gets the `conflicts` label, do these steps before all other work:
   1. Rebase on `main`.
   2. Resolve the conflicts. Keep all `CHANGELOG.md` entries under `[Unreleased]`.
   3. Run the tests again.
   4. Force-push.
7. **Stale items.** If an issue or PR has no activity for 14 days, it gets the `stale` label. If it then has
   no new activity for 30 days, it is closed. These labels prevent this:
   - Issues: `pinned`, `security`, `confirmed`, `work-in-progress`, `priority: critical`, `priority: high`.
   - Pull requests: `pinned`, `security`, `work-in-progress`.
