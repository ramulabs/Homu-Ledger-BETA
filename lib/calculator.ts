export type Calculation =
  | { value: number; error?: never }
  | { value?: never; error: "incomplete" | "divideByZero" | "invalid" | "tooLarge" };

export type CalculatorState = {
  expression: string;
  history: { expression: string; result: string }[];
  evaluated: boolean;
  initialized: boolean;
};

export const EMPTY_CALCULATOR: CalculatorState = {
  expression: "", history: [], evaluated: false, initialized: false,
};

// Parse arithmetic directly: never execute the expression as JavaScript.
// A percentage added to/subtracted from an amount is relative to that amount
// (200 + 10% = 220); multiplication/division use the fraction (200 × 10% = 20).
export function calculate(expression: string): Calculation {
  const source = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!source || source.length > 120) return { error: "incomplete" };
  let position = 0;
  type Term = { value: number; percent: boolean };
  function factor(): Term {
    let sign = 1;
    if (source[position] === "-" || source[position] === "+") {
      if (source[position++] === "-") sign = -1;
    }
    const match = source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error(position === source.length ? "incomplete" : "invalid");
    position += match[0].length;
    let value = sign * Number(match[0]);
    const percent = source[position] === "%";
    if (percent) { position++; value /= 100; }
    return { value, percent };
  }
  function term(): Term {
    let left = factor();
    while (source[position] === "*" || source[position] === "/") {
      const operator = source[position++];
      const right = factor();
      if (operator === "/" && right.value === 0) throw new Error("divideByZero");
      left = { value: operator === "*" ? left.value * right.value : left.value / right.value, percent: false };
    }
    return left;
  }
  try {
    let left = term();
    while (source[position] === "+" || source[position] === "-") {
      const operator = source[position++];
      const right = term();
      const value = right.percent ? left.value * right.value : right.value;
      left = { value: operator === "+" ? left.value + value : left.value - value, percent: false };
    }
    if (position !== source.length) return { error: "invalid" };
    if (!Number.isFinite(left.value) || Math.abs(Number(calculationText(left.value))) >= 1e12) return { error: "tooLarge" };
    return { value: left.value };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid";
    return { error: message === "divideByZero" || message === "incomplete" ? message : "invalid" };
  }
}

// Currency amounts keep at most two decimal places. The transaction form uses
// a comma as its decimal separator and dots only for thousands grouping.
const resultFormat = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 2 });

export function calculationText(value: number): string {
  return resultFormat.format(value);
}

export function rememberCalculation(state: CalculatorState): CalculatorState {
  const calculation = calculate(state.expression);
  if (calculation.error) return state;
  const entry = { expression: state.expression, result: calculationText(calculation.value) };
  const previous = state.history[0];
  return {
    ...state,
    evaluated: true,
    history: previous?.expression === entry.expression && previous.result === entry.result
      ? state.history : [entry, ...state.history].slice(0, 12),
  };
}

export function calculatorKey(state: CalculatorState, key: string): CalculatorState {
  if (key === "=") return rememberCalculation(state);
  let expression = state.expression;
  if (key === "C") expression = "";
  else if (key === "Backspace") expression = expression.slice(0, -1);
  else if (/^[0-9.]$/.test(key)) {
    if (state.evaluated) expression = "";
    if (expression.endsWith("%")) return state;
    const operand = expression.split(/[+−×÷]/).at(-1) ?? "";
    if (key === "." && operand.includes(".")) return state;
    if (key === "." && !operand) expression += "0";
    expression += key;
  } else if (key === "%") {
    if (state.evaluated) {
      const result = calculate(expression);
      if (result.error) return state;
      expression = calculationText(result.value).replace(/-/g, "−");
    }
    if (!/\d$/.test(expression)) return state;
    expression += "%";
  } else if (["+", "−", "×", "÷"].includes(key)) {
    if (!expression) {
      if (key !== "−") return state;
    } else if (state.evaluated) {
      const result = calculate(expression);
      if (result.error) return state;
      expression = calculationText(result.value).replace(/-/g, "−");
    }
    expression = expression.replace(/[+−×÷]$/, "") + key;
  } else return state;
  if (expression.length > 120) return state;
  return { ...state, expression, evaluated: false };
}
