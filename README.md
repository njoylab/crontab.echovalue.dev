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
- No dependencies
- Parsing and preview logic run client-side

## License

MIT
