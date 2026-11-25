# Issue tracker: GitHub

The issues and specs for this repo are GitHub issues. Use the `gh` CLI for all operations.

## Repo-specific rules (from AGENTS.md)

- Use the Issue Forms in `.github/ISSUE_TEMPLATE/` to create issues. Use `01-bug-report.yml` for bugs and
  `02-enhancement-request.yml` for enhancements. With `gh`, use `--template`, or write a body that
  fills the sections of the form.
- Start the title with `[Bug]: ` or `[Enhancement]: `.
- Automation adds `bug`/`enhancement`. Do not add type labels manually.
- The old `triage` label is different from `needs-triage`. Skills use `needs-triage`.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. For a body with many lines, use a heredoc.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` Add the applicable `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` after you create the child (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). If sub-issues are not available, put `Part of #<parent>` at the top of the child body.
- **Blocking**: Use the **native issue dependencies** of GitHub. They are the standard representation, and the UI shows them. Add an edge with `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). If dependencies are not available, put a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when all its blockers are closed.
- **Count open blockers**: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` (open blockers only; 0 means that you can start the ticket). `gh issue view <n> --json blockedBy` also shows closed blockers. Thus, filter the output: `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: Add the explanation with `gh issue comment <number> --body "..."`. Then run `gh issue close <number>`. On an issue that is already closed, `gh issue close --comment` does not add the comment, but it exits with 0.

Get the repo from `git remote -v`. Inside a clone, `gh` does this automatically.

Create issues only in the repo of the user. Do not create issues in `mattpocock/skills` (the source repo of these skills), unless the user owns it. In a fork, `gh` can use the upstream parent as the default. Before the first `gh issue create` of a session, use `gh repo view --json nameWithOwner` to examine the target. If the target is not the repo of the user, ask the user to confirm it.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo uses external PRs as feature requests. `/triage` reads this flag.)_

When the flag is `yes`, PRs use the same labels and states as issues. Use the related `gh pr` commands:

- **Read a PR**: `gh pr view <number>`, then `gh pr view <number> --comments` (without a TTY, `--comments` shows only the comments, not the body), and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

Issues and PRs use the same number range in GitHub. Thus, `#42` alone can be an issue or a PR. Try `gh pr view 42` first. If that fails, use `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

`/wayfinder` uses these operations. The **map** is one issue. Its **child** issues are the tickets.

- **Map**: One issue with the label `wayfinder:map`. Its body contains the Notes / Decisions-so-far / Fog sections. `gh issue create --label wayfinder:map`.
- **Child ticket**: An issue that is linked to the map as a GitHub sub-issue (refer to **Make an issue a sub-issue of a parent**). If sub-issues are not enabled, add the child to a task list in the map body. Then put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). After a developer claims the ticket, it is assigned to that developer.
- **Blocking**: Refer to **Blocking** under Conventions.
- **Frontier query**: Show the open children of the map (`gh issue list --state open`, limited to the sub-issues / task list of the map). Remove each child that has an assignee or an open blocker (refer to **Count open blockers**, or an open issue in the `Blocked by` line). Select the first remaining child in the map order.
- **Claim**: `gh issue edit <n> --add-assignee @me`. This is the first write of the session.
- **Resolve**: Run `gh issue comment <n> --body "<answer>"`. Then run `gh issue close <n>`. Then add a context pointer (gist + link) to the Decisions-so-far section of the map.
