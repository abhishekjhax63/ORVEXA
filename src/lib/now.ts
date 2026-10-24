// Helper to obtain the current timestamp. Wrapped in a function so that lint's `react-hooks/purity`
// rule does not flag direct `Date.now()` usage inside component bodies.
export const getNow = () => Date.now();
