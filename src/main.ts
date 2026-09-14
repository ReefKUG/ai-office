import { DEPARTMENTS, type Department } from "./config.js";
import { callLlm } from "./llm.js";

const main = async () => {
  let totalCost = 0;

  for (const department of Object.keys(DEPARTMENTS) as Department[]) {
    const result = await callLlm(
      department,
      `In one short sentence, introduce yourself as the "${department}" department of a software office.`,
    );
    totalCost += result.costUsd;
    console.log(
      `[${department}] ${result.provider}/${result.model} — ${result.durationMs}ms, $${result.costUsd.toFixed(4)}`,
    );
    console.log(`  ${result.text.trim()}`);
  }

  console.log(`\nTotal cost: $${totalCost.toFixed(4)}`);
};

main();
