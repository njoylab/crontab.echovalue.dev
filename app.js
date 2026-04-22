const input = document.querySelector("#cron-input");
const analysisList = document.querySelector("#analysis-list");
const sampleButton = document.querySelector("#load-sample");
const exampleButtons = document.querySelectorAll(".example-chip");

const SAMPLE_EXPRESSION = "*/15 * * * *";

const FIELD_LIMITS = {
  minute: { min: 0, max: 59, names: null },
  hour: { min: 0, max: 23, names: null },
  dayOfMonth: { min: 1, max: 31, names: null },
  month: {
    min: 1,
    max: 12,
    names: {
      JAN: 1,
      FEB: 2,
      MAR: 3,
      APR: 4,
      MAY: 5,
      JUN: 6,
      JUL: 7,
      AUG: 8,
      SEP: 9,
      OCT: 10,
      NOV: 11,
      DEC: 12,
    },
  },
  weekday: {
    min: 0,
    max: 7,
    names: {
      SUN: 0,
      MON: 1,
      TUE: 2,
      WED: 3,
      THU: 4,
      FRI: 5,
      SAT: 6,
    },
  },
};

const FIELD_ORDER = ["minute", "hour", "dayOfMonth", "month", "weekday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MACROS = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

function debounce(fn, wait) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), wait);
  };
}

function parseExpression(rawValue) {
  const compact = rawValue.trim().replace(/\s+/g, " ");

  if (!compact) {
    return {
      valid: false,
      error: "Enter a cron expression with five fields or a supported shortcut.",
    };
  }

  if (compact.startsWith("@")) {
    const mapped = MACROS[compact.toLowerCase()];

    if (!mapped) {
      return {
        valid: false,
        expression: compact,
        error: `Unsupported shortcut ${compact}.`,
      };
    }

    return buildCronState(mapped.split(" "), compact, compact);
  }

  const tokens = compact.split(" ");
  if (tokens.length !== 5) {
    return {
      valid: false,
      expression: compact,
      error: "Cron expressions need exactly five fields: minute hour day month weekday.",
    };
  }

  return buildCronState(tokens, compact, null);
}

function buildCronState(fieldValues, rawExpression, macro) {
  const fields = {};
  const fieldErrors = [];

  FIELD_ORDER.forEach((fieldName, index) => {
    try {
      fields[fieldName] = parseField(fieldValues[index], fieldName);
    } catch (error) {
      fieldErrors.push(error.message);
    }
  });

  if (fieldErrors.length > 0) {
    return {
      valid: false,
      expression: rawExpression,
      normalized: fieldValues.join(" "),
      error: fieldErrors.join(" "),
    };
  }

  const normalized = fieldValues.join(" ");

  return {
    valid: true,
    macro,
    expression: rawExpression,
    normalized,
    fields,
    explanation: describeSchedule(fields),
    nextRuns: computeNextRuns(fields, 5),
  };
}

function parseField(source, fieldName) {
  const limits = FIELD_LIMITS[fieldName];
  const normalized = source.toUpperCase();

  if (normalized === "*") {
    return { source, wildcard: true, restricted: false, values: null };
  }

  const values = new Set();
  const segments = normalized.split(",");

  segments.forEach((segment) => {
    const [base, stepPart] = segment.split("/");
    const step = stepPart ? Number.parseInt(stepPart, 10) : 1;

    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid step value in ${fieldName}: ${segment}`);
    }

    if (base === "*") {
      expandRange(limits.min, limits.max, step, values, fieldName);
      return;
    }

    if (base.includes("-")) {
      const [startRaw, endRaw] = base.split("-");
      const start = normalizeToken(startRaw, limits, fieldName);
      const end = normalizeToken(endRaw, limits, fieldName);

      if (start > end) {
        throw new Error(`Invalid range in ${fieldName}: ${segment}`);
      }

      expandRange(start, end, step, values, fieldName);
      return;
    }

    const single = normalizeToken(base, limits, fieldName);
    if (stepPart) {
      expandRange(single, limits.max, step, values, fieldName);
      return;
    }

    values.add(adjustWeekday(single, fieldName));
  });

  if (values.size === 0) {
    throw new Error(`Invalid field ${fieldName}: ${source}`);
  }

  return {
    source,
    wildcard: false,
    restricted: true,
    values,
  };
}

function normalizeToken(token, limits, fieldName) {
  const namedValue = limits.names?.[token];
  const numericValue = namedValue ?? Number.parseInt(token, 10);

  if (!Number.isInteger(numericValue)) {
    throw new Error(`Invalid token in ${fieldName}: ${token}`);
  }

  if (numericValue < limits.min || numericValue > limits.max) {
    throw new Error(`Out-of-range value in ${fieldName}: ${token}`);
  }

  return adjustWeekday(numericValue, fieldName);
}

function adjustWeekday(value, fieldName) {
  if (fieldName === "weekday" && value === 7) {
    return 0;
  }
  return value;
}

function expandRange(start, end, step, values, fieldName) {
  for (let cursor = start; cursor <= end; cursor += step) {
    values.add(adjustWeekday(cursor, fieldName));
  }
}

function describeSchedule(fields) {
  const minute = describeField(fields.minute, "minute");
  const hour = describeField(fields.hour, "hour");
  const dom = describeField(fields.dayOfMonth, "dayOfMonth");
  const month = describeField(fields.month, "month");
  const weekday = describeField(fields.weekday, "weekday");

  return `${minute}. ${hour}. ${dom}. ${month}. ${weekday}.`;
}

function describeField(field, fieldName) {
  if (field.wildcard) {
    const phrases = {
      minute: "Every minute",
      hour: "Every hour",
      dayOfMonth: "Every day of the month",
      month: "Every month",
      weekday: "Every day of the week",
    };
    return phrases[fieldName];
  }

  const values = [...field.values].sort((a, b) => a - b);
  const source = field.source.toUpperCase();

  if (source.startsWith("*/")) {
    const step = source.slice(2);
    const unit = fieldName === "minute" ? "minutes" : fieldName === "hour" ? "hours" : fieldLabel(fieldName).toLowerCase();
    return `Every ${step} ${unit}`;
  }

  if (values.length === 1) {
    return singleValueLabel(values[0], fieldName);
  }

  if (values.length <= 5) {
    return `${fieldLabel(fieldName)} ${joinWords(values.map((value) => displayValue(value, fieldName)))}`;
  }

  return `${fieldLabel(fieldName)} ${source}`;
}

function fieldLabel(fieldName) {
  const labels = {
    minute: "Minutes",
    hour: "Hours",
    dayOfMonth: "Days of month",
    month: "Months",
    weekday: "Weekdays",
  };

  return labels[fieldName];
}

function singleValueLabel(value, fieldName) {
  if (fieldName === "minute") {
    return `At minute ${value}`;
  }

  if (fieldName === "hour") {
    return `At ${String(value).padStart(2, "0")}:00`;
  }

  if (fieldName === "dayOfMonth") {
    return `On day ${value} of the month`;
  }

  if (fieldName === "month") {
    return `In ${MONTH_NAMES[value - 1]}`;
  }

  return `On ${WEEKDAY_NAMES[value]}`;
}

function displayValue(value, fieldName) {
  if (fieldName === "month") {
    return MONTH_NAMES[value - 1];
  }

  if (fieldName === "weekday") {
    return WEEKDAY_NAMES[value];
  }

  if (fieldName === "hour") {
    return `${String(value).padStart(2, "0")}:00`;
  }

  return String(value);
}

function joinWords(values) {
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function computeNextRuns(fields, amount) {
  const now = new Date();
  const cursor = new Date(now.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const results = [];
  const limit = 60 * 24 * 366;

  for (let attempts = 0; attempts < limit && results.length < amount; attempts += 1) {
    if (matchesSchedule(cursor, fields)) {
      results.push(new Date(cursor.getTime()));
    }

    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return results;
}

function matchesSchedule(date, fields) {
  const minuteMatch = matchesField(date.getMinutes(), fields.minute);
  const hourMatch = matchesField(date.getHours(), fields.hour);
  const monthMatch = matchesField(date.getMonth() + 1, fields.month);

  if (!minuteMatch || !hourMatch || !monthMatch) {
    return false;
  }

  const domMatch = matchesField(date.getDate(), fields.dayOfMonth);
  const weekdayMatch = matchesField(date.getDay(), fields.weekday);
  const domRestricted = fields.dayOfMonth.restricted;
  const weekdayRestricted = fields.weekday.restricted;

  if (domRestricted && weekdayRestricted) {
    return domMatch || weekdayMatch;
  }

  if (domRestricted) {
    return domMatch;
  }

  if (weekdayRestricted) {
    return weekdayMatch;
  }

  return true;
}

function matchesField(value, field) {
  return field.wildcard ? true : field.values.has(value);
}

function formatRun(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function render() {
  const state = parseExpression(input.value);

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
        <h4>Needs attention</h4>
        <p class="explanation">${escapeHtml(state.error)}</p>
      </article>
    `;
    return;
  }

  const nextRuns = state.nextRuns
    .map((run) => `<span class="next-run">${formatRun(run)}</span>`)
    .join("");

  analysisList.innerHTML = `
    <article class="analysis-card">
      <div class="analysis-top">
        <span class="line-number">Expression</span>
        <span class="status-pill valid">Valid</span>
      </div>
      <div class="cron-expression">${escapeHtml(state.expression)}</div>
      <h4>${escapeHtml(state.explanation)}</h4>
      <p class="explanation">Normalized schedule: <code>${escapeHtml(state.normalized)}</code></p>
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

const debouncedRender = debounce(render, 120);

input.addEventListener("input", debouncedRender);

sampleButton.addEventListener("click", () => {
  input.value = SAMPLE_EXPRESSION;
  render();
});

exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.example || "";
    render();
  });
});

render();
