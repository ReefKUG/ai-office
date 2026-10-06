// Prisma CLI config (migrate, generate, studio). Prisma 7 does not read .env itself,
// so we load it with Node's built-in loader instead of adding dotenv.
import { defineConfig } from "prisma/config";

process.loadEnvFile();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
