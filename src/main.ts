import { prisma } from "./db.js";
import { saveSpec } from "./store.js";
import { startTask } from "./orchestrator.js";
import { closeQueue, enqueueAdvance } from "./queue.js";

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

  // Hand the task to the worker and exit — the worker (pnpm worker) runs the steps.
  const task = await startTask(spec.id);
  await enqueueAdvance(task.id);
  console.log(`Task ${task.id} queued — watch the worker's output.`);
};

// Close DB + Redis connections so the process can exit, even if something failed.
main().finally(async () => {
  await closeQueue();
  await prisma.$disconnect();
});
