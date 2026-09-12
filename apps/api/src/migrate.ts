import { execSync } from "child_process";

execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: process.cwd() });
