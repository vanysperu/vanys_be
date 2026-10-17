import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

import { Development, development } from "./development";
import { production, Production } from "./production";

import { env } from "process";

let currentEnv: Development | Production = development;

if (env.NODE_ENV == "production") {
  currentEnv = production;
}

export default currentEnv;
