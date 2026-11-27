/**
 * The value types and units as the core data files listed them before the questions about counts
 * and values replaced the units. The tests of migrations 0035 and 0052 read these, because those
 * migrations were written against them.
 */
export const LEGACY_VALUE_TYPES: readonly { id: string; name: string }[] = [
  { id: '01a0d8a5-3ca2-7315-bfca-96c7324d4347', name: 'Count' },
  { id: '01a0d8a5-3ca2-7315-bfca-96c8c77cad18', name: 'Crude rate' },
  { id: '01a0d8a5-3ca2-7315-bfca-96c9664c846c', name: 'Directly standardised rate' },
  { id: '01a0d8a5-3ca2-7315-bfca-96ca4c9608e9', name: 'Excess risk' },
  { id: '01a0d8a5-3ca2-7315-bfca-96cb03846bff', name: 'Gap' },
  { id: '01a0d8a5-3ca2-7315-bfca-96cc2dc711c3', name: 'Indirectly standardised proportion' },
  { id: '01a0d8a5-3ca2-7315-bfca-96cda63ea940', name: 'Indirectly standardised ratio' },
  { id: '01a0d8a5-3ca2-7315-bfca-96ce5ffc8d47', name: 'Life expectancy' },
  { id: '01a0d8a5-3ca2-7315-bfca-96cff286704d', name: 'Mean' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d0928fd186', name: 'Median' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d1b508d83f', name: 'Percentage point' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d2031a65e7', name: 'Proportion' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d34a17c74b', name: 'Ratio' },
  { id: '01a0f31b-a23f-749d-a9ea-68b179920ab3', name: 'Relative index of inequality' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d4cc7f7bcb', name: 'Score' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d54168d21f', name: 'Slope index of inequality' },
];

export const LEGACY_UNITS: readonly { id: string; name: string }[] = [
  { id: '01a0d8a5-3ca2-7315-bfca-96d615820bd4', name: '%' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d787920e40', name: 'per 100' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d8d8d7aec2', name: 'per 1,000' },
  { id: '01a0d8a5-3ca2-7315-bfca-96d97b88dbff', name: 'per 10,000' },
  { id: '01a0d8a5-3ca2-7315-bfca-96daa0c93ee9', name: 'per 100,000' },
  { id: '01a0d8a5-3ca2-7315-bfca-96dbaf432da2', name: 'per 1,000,000' },
  { id: '01a0d8a5-3ca2-7315-bfca-96dca2ab3487', name: 'minutes' },
  { id: '01a0d8a5-3ca2-7315-bfca-96dd9ae52dc5', name: 'hours' },
  { id: '01a0d8a5-3ca2-7315-bfca-96de5fe00871', name: 'days' },
  { id: '01a0d8a5-3ca2-7315-bfca-96df3a570e5d', name: 'weeks' },
  { id: '01a0d8a5-3ca2-7315-bfca-96e0128fd88d', name: 'months' },
  { id: '01a0d8a5-3ca2-7315-bfca-96e1a3b040d3', name: 'years' },
  { id: '01a0d8a5-3ca2-7315-bfca-96e2d3cf5df0', name: '£' },
  { id: '01a0d8a5-3ca2-7315-bfca-96e3aae4dc98', name: '£ per capita' },
  { id: '01a0d8a5-3ca2-7315-bfca-96e4a96bfc8e', name: 'No unit' },
  { id: '01a0d8a5-3ca2-7315-bfca-96e5cee57158', name: 'Other' },
];
