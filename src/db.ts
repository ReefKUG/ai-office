import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

// One shared Prisma client for the whole app — like an Angular `providedIn: 'root'` service.
const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });

export const prisma = new PrismaClient({ adapter });
