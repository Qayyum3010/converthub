const { validatePair } = require("./conversions/registry");

console.log("Unknown pair:", validatePair("md", "exe"));
console.log("Known but unimplemented:", validatePair("md", "html"));
console.log("With dots in extension:", validatePair(".md", ".html"));
