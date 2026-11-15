# Team workflow (AFYA-SPACE)

## Branches
- `main`: stable, demo-ready code. Nobody pushes to it directly.
- One branch per task, named `type/short-description`, for example `feat/risk-model-noise`, `fix/osdr-parser`, `docs/readme`.

## Daily routine
```bash
git checkout main && git pull origin main      # start from the latest main
git checkout -b feat/my-task                   # create your branch
# ... work ...
git add <files>                                # avoid "git add ." unless git status looks right
git commit -m "feat(ml): short clear message"
git push -u origin feat/my-task                # first push of the branch
```
Then open a Pull Request on GitHub, ask one teammate to review, and merge.

## Commit message prefixes
`feat`, `fix`, `data`, `docs`, `test`, `chore`

## Rules
- Never commit passwords, tokens or `.env` files. The repository is public.
- Do not commit generated files (`outputs/`, simulated CSV). Regenerate them with the README commands.
- Run the app before opening a Pull Request: `python -m sans.simulate && python -m sans.pipeline && streamlit run dashboard/app.py`.
- Everything in the repository (code, comments, docs) is written in English for the submission.

## Keep your branch up to date
```bash
git fetch origin
git merge origin/main
```
If Git reports a conflict, open the marked files, keep the right version, then `git add <file>` and `git commit`.
