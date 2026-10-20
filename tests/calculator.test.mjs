import assert from "node:assert/strict";
import { test } from "node:test";
import { calculate, calculationText, calculatorKey, rememberCalculation, EMPTY_CALCULATOR } from "../lib/calculator.ts";

function type(keys, initial = EMPTY_CALCULATOR) {
  return [...keys].reduce((state, key) => calculatorKey(state, key), initial);
}

test("arithmetic respects precedence, decimals, negative results, and operator aliases", () => {
  for (const [expression, expected] of [["10+2×3", 16], ["100÷4−5", 20], ["1.5*2+0.25", 3.25], ["2−5", -3], ["−5+3", -2], ["1÷3×3", 1]]) {
    assert.equal(calculate(expression).value, expected, expression);
  }
});

test("percentages work for markups, discounts, multiplication, and chained changes", () => {
  for (const [expression, expected] of [["200+10%", 220], ["200−10%", 180], ["200×10%", 20], ["200÷10%", 2000], ["200+10%+10%", 242], ["10%", 0.1]]) {
    assert.equal(calculate(expression).value, expected, expression);
  }
});

test("currency rounding avoids binary floating point surprises and scientific notation", () => {
  assert.equal(calculationText(calculate("0.1+0.2").value), "0.3");
  assert.equal(calculationText(1.005), "1.01");
  assert.equal(calculationText(10.075), "10.08");
  assert.equal(calculationText(0.000001), "0");
});

test("invalid, unfinished, divide-by-zero, and excessive amounts cannot be applied", () => {
  assert.equal(calculate("200+").error, "incomplete");
  assert.equal(calculate("").error, "incomplete");
  assert.equal(calculate("1÷0").error, "divideByZero");
  assert.equal(calculate("1.2.3").error, "invalid");
  assert.equal(calculate("alert(1)").error, "invalid");
  assert.equal(calculate("999999999999.999").error, "tooLarge");
  assert.equal(calculate("999999999999×999999999999").error, "tooLarge");
});

test("keypad replaces operators and blocks extra decimal points and repeated percentages", () => {
  assert.equal(type("1+×2").expression, "1×2");
  assert.equal(type("1.2.3").expression, "1.23");
  assert.equal(type("10%%").expression, "10%");
  assert.equal(type(".5").expression, "0.5");
  assert.equal(type("×2").expression, "2");
});

test("equals preserves the expression, continues from the result, and starts fresh for a new number", () => {
  const state = type("200+10%=");
  assert.equal(state.expression, "200+10%");
  assert.deepEqual(state.history, [{ expression: "200+10%", result: "220" }]);
  assert.equal(type("×2", state).expression, "220×2");
  assert.equal(type("5", state).expression, "5");
  assert.equal(type("%", state).expression, "220%");
});

test("apply preserves prior input and history without duplicate entries; clear only clears input", () => {
  const state = type("200+10%=");
  const applied = rememberCalculation(state);
  assert.equal(applied.expression, "200+10%");
  assert.equal(applied.history.length, 1);
  const cleared = calculatorKey(applied, "C");
  assert.equal(cleared.expression, "");
  assert.deepEqual(cleared.history, applied.history);
  const restored = { ...cleared, expression: cleared.history[0].expression, evaluated: false };
  assert.equal(calculate(restored.expression).value, 220);
});

test("history retains only the most recent twelve calculations", () => {
  let state = EMPTY_CALCULATOR;
  for (let index = 0; index < 20; index++) state = rememberCalculation({ ...state, expression: `${index}+1` });
  assert.equal(state.history.length, 12);
  assert.equal(state.history[0].expression, "19+1");
});
