import { parseExpression } from "./cron.mjs?v=1";

const input = document.querySelector("#cron-input");
const analysisList = document.querySelector("#analysis-list");
const sampleButton = document.querySelector("#load-sample");
const exampleButtons = document.querySelectorAll(".example-chip");
const copyButton = document.querySelector("#copy-input");
const fieldButtons = document.querySelectorAll(".field-chip");
const fieldDialog = document.querySelector("#field-dialog");
const closeFieldDialogButton = document.querySelector("#close-field-dialog");
const fieldDialogLabel = document.querySelector("#field-dialog-label");
const fieldDialogTitle = document.querySelector("#field-dialog-title");
const fieldDialogCopy = document.querySelector("#field-dialog-copy");
const fieldDialogBody = document.querySelector("#field-dialog-body");

const SAMPLE_EXPRESSIONS = [
  "*/5 * * * *",
  "*/15 * * * *",
  "0 */2 * * *",
  "0 9 * * MON-FRI",
  "15 14 1 * *",
  "0 18 * * 1,3,5",
  "30 6 1,15 * *",
  "0 12 * JAN-MAR MON-FRI",
  "@daily",
  "@hourly",
];

const FIELD_HELP = {
  minute: {
    label: "Minute",
    copy: "Accepted values: 0-59",
    html: `
      <p>Controls the minute within the hour.</p>
      <ul>
        <li><code>*</code> every minute</li>
        <li><code>0</code> exactly at minute 0</li>
        <li><code>*/15</code> every 15 minutes</li>
        <li><code>5,20,35,50</code> specific minutes</li>
        <li><code>10-30</code> a minute range</li>
      </ul>
    `,
  },
  hour: {
    label: "Hour",
    copy: "Accepted values: 0-23",
    html: `
      <p>Controls the hour of the day in 24-hour format.</p>
      <ul>
        <li><code>*</code> every hour</li>
        <li><code>0</code> midnight</li>
        <li><code>9</code> 09:00</li>
        <li><code>*/2</code> every 2 hours</li>
        <li><code>9-17</code> business-hour range</li>
      </ul>
    `,
  },
  dayOfMonth: {
    label: "Day of month",
    copy: "Accepted values: 1-31",
    html: `
      <p>Controls the day number within the month.</p>
      <ul>
        <li><code>*</code> every day of the month</li>
        <li><code>1</code> first day of the month</li>
        <li><code>1,15</code> first and fifteenth</li>
        <li><code>1-7</code> first week of the month</li>
      </ul>
    `,
  },
  month: {
    label: "Month",
    copy: "Accepted values: 1-12 or JAN-DEC",
    html: `
      <p>Controls the month of the year.</p>
      <ul>
        <li><code>*</code> every month</li>
        <li><code>1</code> January</li>
        <li><code>JAN,MAR,JUN</code> specific named months</li>
        <li><code>JAN-MAR</code> a month range</li>
      </ul>
    `,
  },
  weekday: {
    label: "Weekday",
    copy: "Accepted values: 0-7 or SUN-SAT, where 0 and 7 are Sunday",
    html: `
      <p>Controls the day of the week.</p>
      <ul>
        <li><code>*</code> every weekday value</li>
        <li><code>1</code> Monday</li>
        <li><code>MON-FRI</code> weekdays</li>
        <li><code>1,3,5</code> Monday, Wednesday, Friday</li>
      </ul>
    `,
  },
};

function debounce(fn, wait) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), wait);
  };
}

function getRandomSampleExpression() {
  const index = Math.floor(Math.random() * SAMPLE_EXPRESSIONS.length);
  return SAMPLE_EXPRESSIONS[index];
}

function formatRun(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function render() {
  const state = parseExpression(input.value);
  input.setAttribute("aria-invalid", String(!state.valid && Boolean(input.value.trim())));

  if (!input.value.trim()) {
    analysisList.innerHTML = `<p class="analysis-empty">Enter a cron expression like <code>*/15 * * * *</code> or <code>@daily</code>.</p>`;
    return;
  }

  if (!state.valid) {
    analysisList.innerHTML = `
      <article class="analysis-card">
        <div class="analysis-top">
          <span class="line-number">Expression</span>
          <span class="status-pill invalid">Invalid</span>
        </div>
        <div class="cron-expression">${escapeHtml(state.expression || input.value.trim())}</div>
        <h3>Needs attention</h3>
        <p class="explanation">${escapeHtml(state.error)}</p>
      </article>
    `;
    return;
  }

  const nextRuns = state.nextRuns
    .map((run) => `<time class="next-run" datetime="${run.toISOString()}">${escapeHtml(formatRun(run))}</time>`)
    .join("");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  analysisList.innerHTML = `
    <article class="analysis-card">
      <div class="analysis-top">
        <span class="line-number">Expression</span>
        <span class="status-pill valid">Valid</span>
      </div>
      <div class="cron-expression">${escapeHtml(state.expression)}</div>
      <h3>${escapeHtml(state.explanation)}</h3>
      <p class="explanation">Normalized schedule: <code>${escapeHtml(state.normalized)}</code></p>
      <p class="explanation">Upcoming runs in your local time zone: ${escapeHtml(timeZone)}.</p>
      ${state.previewNotice ? `<p class="explanation">${escapeHtml(state.previewNotice)}</p>` : ""}
      <div class="runs-list">${nextRuns}</div>
    </article>
  `;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function copyInputValue() {
  try {
    await navigator.clipboard.writeText(input.value);
    const original = copyButton.textContent;
    copyButton.textContent = "Copied";
    window.setTimeout(() => {
      copyButton.textContent = original;
    }, 1200);
  } catch {
    copyButton.textContent = "Copy failed";
    window.setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1200);
  }
}

function openFieldDialog(fieldName) {
  const config = FIELD_HELP[fieldName];
  if (!config) {
    return;
  }

  fieldDialogLabel.textContent = "Field";
  fieldDialogTitle.textContent = config.label;
  fieldDialogCopy.textContent = config.copy;
  fieldDialogBody.innerHTML = config.html;
  fieldDialog.showModal();
}

const debouncedRender = debounce(render, 120);

input.addEventListener("input", debouncedRender);
copyButton.addEventListener("click", copyInputValue);

sampleButton.addEventListener("click", () => {
  input.value = getRandomSampleExpression();
  render();
});

exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.example || "";
    render();
  });
});

fieldButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openFieldDialog(button.dataset.field || "");
  });
});

closeFieldDialogButton.addEventListener("click", () => {
  fieldDialog.close();
});

fieldDialog.addEventListener("click", (event) => {
  const bounds = fieldDialog.getBoundingClientRect();
  const clickedOutside =
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom;

  if (clickedOutside) {
    fieldDialog.close();
  }
});

input.value = getRandomSampleExpression();
render();
