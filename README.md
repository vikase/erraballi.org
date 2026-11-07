# erraballi.org

The Erraballi family website.

- `index.html` is the family tree page.
- `data/people.psv` is the list of people (one row per person, columns split by `|`). It comes from the Google Sheet "Family tree master (erraballi.org)".
- `img/` holds photos.
- `data/stories.json` is the list of family stories. Each story is in `stories/<name>/` (a page frame and `story.md`). `stories/index.html` is the public guide for relatives. To add a story, read `stories/HOW-TO-ADD.md`.
- `.nojekyll` stops GitHub Pages from changing the `.md` files.

GitHub Pages serves this repo at family.erraballi.org (see `CNAME`).
