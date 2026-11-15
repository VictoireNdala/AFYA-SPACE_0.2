# Team workflow (SANS Guardian)

Adapted from the AFYA SPACE team rules.

## Branches
- `main`: stable, demo-ready code. Nobody pushes to it directly.
- One branch per task, named `type/short-description`, for example `feat/voice-french`, `fix/radio-retry`, `docs/readme`.

## Daily routine
```bash
git checkout main && git pull origin main      # start from the latest main
git checkout -b feat/my-task                   # create your branch
# ... work ...
git add <files>                                # check git status before adding
git commit -m "feat(voice): short clear message"
git push -u origin feat/my-task                # first push of the branch
```
Then open a Pull Request on GitHub, ask one teammate to review, and merge.

## Commit message prefixes
`feat`, `fix`, `data`, `docs`, `test`, `chore`

## Rules
- Never commit passwords, tokens or `.env` files. The repository is public.
- Do not commit generated files (`server/data/*.db`, `client/dist`, `analysis/outputs`, `analysis/.venv`). Regenerate them with the README commands.
- Before opening a Pull Request: `npm test` in `server/`, `npm run build` in `client/`, then run the app and click through the demo script.
- Everything in the repository (code, comments, docs) is written in English for the submission.

## Keep your branch up to date
```bash
git fetch origin
git merge origin/main
```
If Git reports a conflict, open the marked files, keep the right version, then `git add <file>` and `git commit`.
