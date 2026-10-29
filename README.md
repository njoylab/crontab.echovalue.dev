# crontab.echovalue.dev

Minimal client-side cron expression parser and explainer.

It parses classic 5-field cron expressions, supports shortcuts such as `@daily`, renders a plain-language description, and previews the next runs directly in the browser.

## Stack

- HTML
- CSS
- Vanilla JavaScript

## Local development

Serve the directory as a static site.

```sh
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Notes

- No build step
- No backend
- No JavaScript dependencies; fonts and icons load from Google Fonts and cdnjs
- Parsing and preview logic run client-side
- `cron.mjs` contains the cron engine; `app.js` renders its results using native browser modules
- Serve over HTTP(S), as above; opening `index.html` directly via `file://` does not support module loading

## Schedule semantics

- Five fields, numeric lists/ranges/steps, three-letter month/weekday names and the documented macros
- Sunday is both 0 and 7; range steps are expanded before normalizing Sunday
- Following Cronie, restricted day-of-month and weekday fields use OR. When either field starts with `*` (including `*/n`), their matches use AND
- Steps select values within a field, not a continuous elapsed-time interval; single-value steps extend through that field's maximum
- Preview uses the browser's local time zone, shown alongside results. Nonexistent local times are skipped and repeated local times are shown twice with their offsets; the actual scheduler's DST policy may differ
- Preview searches for five runs within 32 years, skipping incompatible calendar days/months. Empty or partial previews include a notice; syntactic validity does not guarantee a possible calendar date

## Tests

With Node.js 22 or newer, run the dependency-free regression suite:

```sh
node --test test/*.test.mjs
```

Tests cover malformed syntax, weekday ranges, day-field combinations, descriptions,
annual/leap-year schedules, impossible dates, and both daylight-saving transitions.

## License

MIT
