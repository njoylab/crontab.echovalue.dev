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

const PREVIEW_YEARS = 32;

export function parseExpression(rawValue) {
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
  const nextRuns = computeNextRuns(fields, 5);
  const previewNotice = nextRuns.length === 0
    ? `No matching runs in the next ${PREVIEW_YEARS} years. Check the calendar fields.`
    : nextRuns.length < 5
      ? `Only ${nextRuns.length} matching runs found in the next ${PREVIEW_YEARS} years.`
      : null;

  return {
    valid: true,
    macro,
    expression: rawExpression,
    normalized,
    fields,
    explanation: describeSchedule(fields),
    nextRuns,
    previewNotice,
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
    const match = /^(\*|[A-Z]{3}|\d+)(?:-([A-Z]{3}|\d+))?(?:\/(\d+))?$/.exec(segment);
    if (!match || (match[1] === "*" && match[2])) {
      throw new Error(`Invalid syntax in ${fieldName}: ${segment}`);
    }
    const [, base, endRaw, stepPart] = match;
    const step = stepPart === undefined ? 1 : Number(stepPart);

    if (!Number.isSafeInteger(step) || step < 1) {
      throw new Error(`Invalid step value in ${fieldName}: ${segment}`);
    }

    if (base === "*") {
      expandRange(limits.min, limits.max, step, values, fieldName);
      return;
    }

    if (endRaw !== undefined) {
      const start = normalizeToken(base, limits, fieldName);
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
    // Cronie uses the leading asterisk, including */n, for the day-field AND rule.
    restricted: !normalized.startsWith("*"),
    values,
  };
}

function normalizeToken(token, limits, fieldName) {
  const namedValue = limits.names?.[token];
  const numericValue = namedValue ?? (/^\d+$/.test(token) ? Number(token) : NaN);

  if (!Number.isInteger(numericValue)) {
    throw new Error(`Invalid token in ${fieldName}: ${token}`);
  }

  if (numericValue < limits.min || numericValue > limits.max) {
    throw new Error(`Out-of-range value in ${fieldName}: ${token}`);
  }

  return numericValue;
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
  const minutes = fields.minute.wildcard ? null : [...fields.minute.values].sort((a, b) => a - b);
  const hours = fields.hour.wildcard ? null : [...fields.hour.values].sort((a, b) => a - b);
  let time;
  if (minutes?.length === 1 && hours?.length === 1) {
    time = `At ${String(hours[0]).padStart(2, "0")}:${String(minutes[0]).padStart(2, "0")}`;
  } else {
    const minuteText = !minutes || minutes.length === 60
      ? "Every minute"
      : `At ${minutes.length === 1 ? "minute" : "minutes"} ${joinWords(minutes.map(String))}`;
    const hourText = !hours || hours.length === 24
      ? "every hour"
      : `hour${hours.length === 1 ? "" : "s"} ${joinWords(hours.map(value => String(value).padStart(2, "0")))}`;
    time = `${minuteText} ${!minutes || minutes.length === 60 ? "during" : "past"} ${hourText}`;
  }

  const dom = describeField(fields.dayOfMonth, "dayOfMonth");
  const weekday = describeField(fields.weekday, "weekday");
  let days = "Every day";
  if (!fields.dayOfMonth.wildcard && !fields.weekday.wildcard) {
    const operator = fields.dayOfMonth.restricted && fields.weekday.restricted ? "or" : "and";
    days = `${dom} ${operator} ${weekday[0].toLowerCase()}${weekday.slice(1)}`;
  } else if (!fields.dayOfMonth.wildcard) {
    days = dom;
  } else if (!fields.weekday.wildcard) {
    days = weekday;
  }

  return `${time}. ${days}. ${describeField(fields.month, "month")}.`;
}

function describeField(field, fieldName) {
  if (field.wildcard) {
    const phrases = {
      dayOfMonth: "Every day of the month",
      month: "Every month",
      weekday: "Every day of the week",
    };
    return phrases[fieldName];
  }

  const values = [...field.values].sort((a, b) => a - b);
  if (values.length === 1) {
    return singleValueLabel(values[0], fieldName);
  }

  return `${fieldLabel(fieldName)} ${joinWords(values.map((value) => displayValue(value, fieldName)))}`;
}

function fieldLabel(fieldName) {
  const labels = {
    dayOfMonth: "Days of month",
    month: "Months",
    weekday: "Weekdays",
  };

  return labels[fieldName];
}

function singleValueLabel(value, fieldName) {
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

  return String(value);
}

function joinWords(values) {
  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function computeNextRuns(fields, amount) {
  const now = new Date();
  let cursor = new Date(Math.floor(now.getTime() / 60000) * 60000 + 60000);
  const limit = new Date(now.getTime());
  limit.setFullYear(limit.getFullYear() + PREVIEW_YEARS);
  const results = [];

  while (cursor < limit && results.length < amount) {
    if (!matchesField(cursor.getMonth() + 1, fields.month)) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      continue;
    }
    if (!matchesDay(cursor, fields)) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      continue;
    }
    if (matchesField(cursor.getMinutes(), fields.minute) && matchesField(cursor.getHours(), fields.hour)) {
      results.push(new Date(cursor.getTime()));
    }
    // Advance real elapsed time to retain both occurrences of a repeated DST hour.
    cursor = new Date(cursor.getTime() + 60000);
  }

  return results;
}

function matchesDay(date, fields) {
  const domMatch = matchesField(date.getDate(), fields.dayOfMonth);
  const weekdayMatch = matchesField(date.getDay(), fields.weekday);
  const domRestricted = fields.dayOfMonth.restricted;
  const weekdayRestricted = fields.weekday.restricted;

  if (domRestricted && weekdayRestricted) {
    return domMatch || weekdayMatch;
  }

  return domMatch && weekdayMatch;
}

function matchesField(value, field) {
  return field.wildcard ? true : field.values.has(value);
}

