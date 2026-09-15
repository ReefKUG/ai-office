import type { SpecArtifact } from "../docs/office-contracts.js";
import { saveArtifact } from "./store.js";
import { runTask } from "./orchestrator.js";

const main = async () => {
  const spec = saveArtifact<SpecArtifact>({
    type: "spec",
    title: "FizzBuzz function",
    description: "A TypeScript function fizzbuzz(n: number): string[] returning FizzBuzz output for 1..n.",
    acceptanceCriteria: [
      "Multiples of 3 return 'Fizz'",
      "Multiples of 5 return 'Buzz'",
      "Multiples of both 3 and 5 return 'FizzBuzz'",
      "All other numbers return their own string value",
    ],
  });

  const result = await runTask(spec.id);

  console.log(`\nFinal status: ${result.review.passed ? "PASS" : "FAIL"} after ${result.loops} loop(s)`);
  console.log(`Total cost: $${result.totalCostUsd.toFixed(4)}`);
};

main();
