import type { FastifyPluginAsync } from "fastify";
import { startTask } from "../orchestrator.js";
import { enqueueAdvance } from "../queue.js";
import { getCode, getTask, NotFoundError, saveSpec } from "../store.js";

// Routes stay thin: validate input, call existing store/orchestrator/queue functions, return JSON.

interface CreateTaskBody {
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

interface TaskParams {
  id: string;
}

const createTaskSchema = {
  body: {
    type: "object",
    required: ["title", "description", "acceptanceCriteria"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      acceptanceCriteria: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    },
  },
};

export const taskRoutes: FastifyPluginAsync = async (app) => {
  // Save the spec, create the task, queue the first step — and reply without waiting for the LLMs.
  app.post<{ Body: CreateTaskBody }>("/tasks", { schema: createTaskSchema }, async (request, reply) => {
    const spec = await saveSpec({ type: "spec", ...request.body });
    const task = await startTask(spec.id);
    await enqueueAdvance(task.id);
    return reply.code(201).send(task);
  });

  // Live state: status, loop, cost so far.
  app.get<{ Params: TaskParams }>("/tasks/:id", async (request) => {
    return getTask(request.params.id);
  });

  // The latest code Dev wrote for this task.
  app.get<{ Params: TaskParams }>("/tasks/:id/code", async (request) => {
    const task = await getTask(request.params.id);
    if (!task.lastCodeId) throw new NotFoundError(`Task "${task.id}" has no code yet`);
    return getCode(task.lastCodeId);
  });
};
