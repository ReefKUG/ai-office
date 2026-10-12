import type { CodeArtifact, Task } from "../docs/office-contracts.js";

// Demo client: sends a sample spec to the API and polls the task until it finishes.
// Needs `pnpm api` and `pnpm worker` running.

const API_URL = process.env["API_URL"] ?? "http://localhost:3000";
const FINAL = ["PASSED", "FAILED_MAX_LOOPS", "FAILED_BUDGET"];

const main = async () => {
  const response = await fetch(`${API_URL}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "FizzBuzz function",
      description: "A TypeScript function fizzbuzz(n: number): string[] returning FizzBuzz output for 1..n.",
      acceptanceCriteria: [
        "Multiples of 3 return 'Fizz'",
        "Multiples of 5 return 'Buzz'",
        "Multiples of both 3 and 5 return 'FizzBuzz'",
        "All other numbers return their own string value",
      ],
    }),
  });
  if (!response.ok) throw new Error(`POST /tasks failed: ${response.status} ${await response.text()}`);

  let task = (await response.json()) as Task;
  console.log(`POST /tasks → ${task.id} (${task.status})`);

  // Poll once a second and print each status change.
  let lastStatus = task.status;
  while (!FINAL.includes(task.status)) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    task = (await (await fetch(`${API_URL}/tasks/${task.id}`)).json()) as Task;
    if (task.status !== lastStatus) {
      console.log(`GET /tasks/${task.id} → ${task.status} ($${task.totalCostUsd.toFixed(4)})`);
      lastStatus = task.status;
    }
  }

  const code = (await (await fetch(`${API_URL}/tasks/${task.id}/code`)).json()) as CodeArtifact;
  console.log(`\nGET /tasks/${task.id}/code → revision ${code.revision}:\n\n${code.code}`);
};

main();
