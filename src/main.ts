import { prisma } from "./db.js";
import { saveSpec } from "./store.js";
import { advanceTask, isFinal, startTask } from "./orchestrator.js";

const main = async () => {
  const spec = await saveSpec({
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

  // Step the state machine until it stops. In the next phase a BullMQ worker does this instead.
  let task = await startTask(spec.id);
  while (!isFinal(task)) {
    task = await advanceTask(task.id);
  }

  console.log(`\nFinal status: ${task.status} after ${task.loop} loop(s)`);
  console.log(`Total cost: $${task.totalCostUsd.toFixed(4)}`);
};

// Close the DB pool so the process can exit, even if the task failed.
main().finally(() => prisma.$disconnect());
