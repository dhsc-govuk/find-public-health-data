import { describe, expect, it } from 'vitest';

import { ciMethodAnswers } from './ci-method.ts';

const methods = [
  { id: 1, name: 'Wilson Score method' },
  { id: 2, name: "Byar's method" },
  { id: 8, name: "Byar's method (no small number correction)" },
  { id: 10, name: 'Unknown' },
];

describe('ciMethodAnswers', () => {
  it('keeps a method the service lists, leaving the modifications question unanswered', () => {
    expect(ciMethodAnswers(1, methods)).toEqual({
      ci_method_id: 1,
      has_ci_method_modifications: null,
      ci_method_modifications_detail: null,
    });
  });

  it("records Byar's method with no small number correction as Byar's method, modified", () => {
    expect(ciMethodAnswers(8, methods)).toEqual({
      ci_method_id: 2,
      has_ci_method_modifications: true,
      ci_method_modifications_detail: 'No small number correction',
    });
  });

  it.each([
    ['an unknown method', 10],
    ['no method', null],
  ])('leaves %s unanswered', (_, id) => {
    expect(ciMethodAnswers(id, methods)).toEqual({
      ci_method_id: null,
      has_ci_method_modifications: null,
      ci_method_modifications_detail: null,
    });
  });

  it("stops the export when Pholio lists no Byar's method to point the variant at", () => {
    expect(() =>
      ciMethodAnswers(8, [{ id: 8, name: "Byar's method (no small number correction)" }]),
    ).toThrow("Pholio lists no Byar's method");
  });
});
