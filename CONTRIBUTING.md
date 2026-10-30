# Contributing

These rules follow the course Git tutorial and the project grading criteria.

## First-time setup

Commits are graded per member, so they must be linked to your GitHub account. Use an email address that is added to your GitHub account:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

## Branches

| Branch | Purpose | Direct push |
| --- | --- | --- |
| `main` | Releases shown to the TA at the end of a sprint and at demos | No |
| `dev` | Integration branch and the default target for pull requests | No |
| `<name>/<issue>/<type>/<description>` | Your work | Yes |

`<type>` is `feature`, `bugfix`, `test`, `docs` or `chore`. `<issue>` is the Jira or GitHub issue number.

Examples:

- `ahmet/91/feature/login`
- `ahmet/73/bugfix/admin-table-alignment`

## Daily workflow

```bash
git switch dev
git pull --ff-only
git switch -c ahmet/91/feature/login

# work, then commit in small steps
git add <files>
git commit -m "feat: add login form"
git push -u origin ahmet/91/feature/login
```

Then open a pull request into `dev`.

## Commit messages

Use `<type>: <what changed>`, in the imperative mood, and keep each commit small and focused:

```text
feat: add login form
fix: handle empty password
test: cover cart stock limit
docs: describe local setup
chore: update dependencies
```

Commit steadily during the sprint. The course checks both the quality and the timing of commits, so filler commits and last-night bursts count against you.

## Pull requests

1. Open the pull request into `dev` and fill in the template.
2. Get one approval from a teammate who did not write the code.
3. Merge with a merge commit. Squash merging is turned off so that each member's commits stay in the history for grading.

At the end of a sprint, merge `dev` into `main` through a pull request and tag the release:

```bash
git switch main
git pull --ff-only
git tag sprint-1
git push origin sprint-1
```

## Tests

Each demo needs at least 25 new unit test cases. Add tests in the same pull request as the code they cover.

## Bug reports

Each demo needs at least 5 new bug reports. Use the bug report template and describe the facts needed to reproduce the problem. Add one severity label and one priority label; the two are independent.

| Severity | Meaning |
| --- | --- |
| `severity: trivial` | Cosmetic problem |
| `severity: minor` | Problem with an easy workaround |
| `severity: normal` | Standard problem |
| `severity: major` | Major loss of function |
| `severity: critical` | Crash, data loss or memory corruption |
| `severity: showstopper` | Blocks development or release |

Close a bug with a resolution: `FIXED` (link the pull request), or one of the `invalid`, `duplicate`, `wontfix` and `worksforme` labels.

## Secrets

Never commit passwords, API keys, database dumps or `.env` files. Commit a `.env.example` with placeholder values instead. If a secret is committed by mistake, tell the team and replace it, because deleting it in a later commit does not remove it from the history.

## AI tools

AI tools are allowed by the course, but you must understand, verify and be able to explain everything you commit. Demos include technical questions about your own contribution.
