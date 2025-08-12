#!/usr/bin/env node
import { Command } from 'commander';
import { parse } from 'dotenv';
import semver from 'semver';
import prettier, { format } from 'prettier';
import * as z from 'zod/v4';
import fs$2, { existsSync } from 'fs';
import path from 'path';
import fs$1 from 'fs/promises';
import fs from 'fs-extra';
import chalk from 'chalk';
import { intro, log, outro, confirm, isCancel, cancel, spinner, text, select, multiselect } from '@clack/prompts';
import { exec } from 'child_process';
import { logger, BetterAuthError, createTelemetry, getTelemetryAuthConfig, capitalizeFirstLetter } from 'better-auth';
import Crypto from 'crypto';
import yoctoSpinner from 'yocto-spinner';
import prompts from 'prompts';
import { getAdapter, getMigrations, getAuthTables } from 'better-auth/db';
import { loadConfig } from 'c12';
import babelPresetTypeScript from '@babel/preset-typescript';
import babelPresetReact from '@babel/preset-react';
import { produceSchema } from '@mrleebo/prisma-ast';
import 'dotenv/config';

function getPackageInfo(cwd) {
  const packageJsonPath = cwd ? path.join(cwd, "package.json") : path.join("package.json");
  try {
    return fs.readJSONSync(packageJsonPath);
  } catch (error) {
    throw error;
  }
}

function installDependencies({
  dependencies,
  packageManager,
  cwd
}) {
  let installCommand;
  switch (packageManager) {
    case "npm":
      installCommand = "npm install --force";
      break;
    case "pnpm":
      installCommand = "pnpm install";
      break;
    case "bun":
      installCommand = "bun install";
      break;
    case "yarn":
      installCommand = "yarn install";
      break;
    default:
      throw new Error("Invalid package manager");
  }
  const command = `${installCommand} ${dependencies.join(" ")}`;
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr));
        return;
      }
      resolve(true);
    });
  });
}

function checkCommand(command) {
  return new Promise((resolve) => {
    exec(`${command} --version`, (error) => {
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
async function checkPackageManagers() {
  const hasPnpm = await checkCommand("pnpm");
  const hasBun = await checkCommand("bun");
  return {
    hasPnpm,
    hasBun
  };
}

function formatMilliseconds(ms) {
  if (ms < 0) {
    throw new Error("Milliseconds cannot be negative");
  }
  if (ms < 1e3) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1e3);
  const milliseconds = ms % 1e3;
  return `${seconds}s ${milliseconds}ms`;
}

const generateSecret = new Command("secret").action(() => {
  const secret = generateSecretHash();
  logger.info(`
Add the following to your .env file: 
${chalk.gray("# Auth Secret") + chalk.green(`
BETTER_AUTH_SECRET=${secret}`)}`);
});
const generateSecretHash = () => {
  return Crypto.randomBytes(32).toString("hex");
};

async function generateAuthConfig({
  format,
  current_user_config,
  spinner,
  plugins,
  database
}) {
  let _start_of_plugins_common_index = {
    START_OF_PLUGINS: {
      type: "regex",
      regex: /betterAuth\([\w\W]*plugins:[\W]*\[()/m,
      getIndex: ({ matchIndex, match }) => {
        return matchIndex + match[0].length;
      }
    }
  };
  const common_indexes = {
    START_OF_PLUGINS: _start_of_plugins_common_index.START_OF_PLUGINS,
    END_OF_PLUGINS: {
      type: "manual",
      getIndex: ({ content, additionalFields }) => {
        const closingBracketIndex = findClosingBracket(
          content,
          additionalFields.start_of_plugins,
          "[",
          "]"
        );
        return closingBracketIndex;
      }
    },
    START_OF_BETTERAUTH: {
      type: "regex",
      regex: /betterAuth\({()/m,
      getIndex: ({ matchIndex }) => {
        return matchIndex + "betterAuth({".length;
      }
    }
  };
  const config_generation = {
    add_plugin: async (opts) => {
      let start_of_plugins = getGroupInfo(
        opts.config,
        common_indexes.START_OF_PLUGINS,
        {}
      );
      if (!start_of_plugins) {
        throw new Error(
          "Couldn't find start of your plugins array in your auth config file."
        );
      }
      let end_of_plugins = getGroupInfo(
        opts.config,
        common_indexes.END_OF_PLUGINS,
        { start_of_plugins: start_of_plugins.index }
      );
      if (!end_of_plugins) {
        throw new Error(
          "Couldn't find end of your plugins array in your auth config file."
        );
      }
      let new_content;
      if (opts.direction_in_plugins_array === "prepend") {
        new_content = insertContent({
          line: start_of_plugins.line,
          character: start_of_plugins.character,
          content: opts.config,
          insert_content: `${opts.pluginFunctionName}(${opts.pluginContents}),`
        });
      } else {
        let has_found_comma = false;
        const str = opts.config.slice(start_of_plugins.index, end_of_plugins.index).split("").reverse();
        for (let index = 0; index < str.length; index++) {
          const char = str[index];
          if (char === ",") {
            has_found_comma = true;
          }
          if (char === ")") {
            break;
          }
        }
        new_content = insertContent({
          line: end_of_plugins.line,
          character: end_of_plugins.character,
          content: opts.config,
          insert_content: `${!has_found_comma ? "," : ""}${opts.pluginFunctionName}(${opts.pluginContents})`
        });
      }
      try {
        new_content = await format(new_content);
      } catch (error) {
        console.error(error);
        throw new Error(
          `Failed to generate new auth config during plugin addition phase.`
        );
      }
      return { code: await new_content, dependencies: [], envs: [] };
    },
    add_import: async (opts) => {
      let importString = "";
      for (const import_ of opts.imports) {
        if (Array.isArray(import_.variables)) {
          importString += `import { ${import_.variables.map(
            (x) => `${x.asType ? "type " : ""}${x.name}${x.as ? ` as ${x.as}` : ""}`
          ).join(", ")} } from "${import_.path}";
`;
        } else {
          importString += `import ${import_.variables.asType ? "type " : ""}${import_.variables.name}${import_.variables.as ? ` as ${import_.variables.as}` : ""} from "${import_.path}";
`;
        }
      }
      try {
        let new_content = format(importString + opts.config);
        return { code: await new_content, dependencies: [], envs: [] };
      } catch (error) {
        console.error(error);
        throw new Error(
          `Failed to generate new auth config during import addition phase.`
        );
      }
    },
    add_database: async (opts) => {
      const required_envs = [];
      const required_deps = [];
      let database_code_str = "";
      async function add_db({
        db_code,
        dependencies,
        envs,
        imports,
        code_before_betterAuth
      }) {
        if (code_before_betterAuth) {
          let start_of_betterauth2 = getGroupInfo(
            opts.config,
            common_indexes.START_OF_BETTERAUTH,
            {}
          );
          if (!start_of_betterauth2) {
            throw new Error("Couldn't find start of betterAuth() function.");
          }
          opts.config = insertContent({
            line: start_of_betterauth2.line - 1,
            character: 0,
            content: opts.config,
            insert_content: `
${code_before_betterAuth}
`
          });
        }
        const code_gen = await config_generation.add_import({
          config: opts.config,
          imports
        });
        opts.config = code_gen.code;
        database_code_str = db_code;
        required_envs.push(...envs, ...code_gen.envs);
        required_deps.push(...dependencies, ...code_gen.dependencies);
      }
      if (opts.database === "sqlite") {
        await add_db({
          db_code: `new Database(process.env.DATABASE_URL || "database.sqlite")`,
          dependencies: ["better-sqlite3"],
          envs: ["DATABASE_URL"],
          imports: [
            {
              path: "better-sqlite3",
              variables: {
                asType: false,
                name: "Database"
              }
            }
          ]
        });
      } else if (opts.database === "postgres") {
        await add_db({
          db_code: `new Pool({
connectionString: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/database"
})`,
          dependencies: ["pg"],
          envs: ["DATABASE_URL"],
          imports: [
            {
              path: "pg",
              variables: [
                {
                  asType: false,
                  name: "Pool"
                }
              ]
            }
          ]
        });
      } else if (opts.database === "mysql") {
        await add_db({
          db_code: `createPool(process.env.DATABASE_URL!)`,
          dependencies: ["mysql2"],
          envs: ["DATABASE_URL"],
          imports: [
            {
              path: "mysql2/promise",
              variables: [
                {
                  asType: false,
                  name: "createPool"
                }
              ]
            }
          ]
        });
      } else if (opts.database === "mssql") {
        const dialectCode = `new MssqlDialect({
						tarn: {
							...Tarn,
							options: {
							min: 0,
							max: 10,
							},
						},
						tedious: {
							...Tedious,
							connectionFactory: () => new Tedious.Connection({
							authentication: {
								options: {
								password: 'password',
								userName: 'username',
								},
								type: 'default',
							},
							options: {
								database: 'some_db',
								port: 1433,
								trustServerCertificate: true,
							},
							server: 'localhost',
							}),
						},
					})`;
        await add_db({
          code_before_betterAuth: dialectCode,
          db_code: `dialect`,
          dependencies: ["tedious", "tarn", "kysely"],
          envs: ["DATABASE_URL"],
          imports: [
            {
              path: "tedious",
              variables: {
                name: "*",
                as: "Tedious"
              }
            },
            {
              path: "tarn",
              variables: {
                name: "*",
                as: "Tarn"
              }
            },
            {
              path: "kysely",
              variables: [
                {
                  name: "MssqlDialect"
                }
              ]
            }
          ]
        });
      } else if (opts.database === "drizzle:mysql" || opts.database === "drizzle:sqlite" || opts.database === "drizzle:pg") {
        await add_db({
          db_code: `drizzleAdapter(db, {
provider: "${opts.database.replace(
            "drizzle:",
            ""
          )}",
})`,
          dependencies: [""],
          envs: [],
          imports: [
            {
              path: "better-auth/adapters/drizzle",
              variables: [
                {
                  name: "drizzleAdapter"
                }
              ]
            },
            {
              path: "./database.ts",
              variables: [
                {
                  name: "db"
                }
              ]
            }
          ]
        });
      } else if (opts.database === "prisma:mysql" || opts.database === "prisma:sqlite" || opts.database === "prisma:postgresql") {
        await add_db({
          db_code: `prismaAdapter(client, {
provider: "${opts.database.replace(
            "prisma:",
            ""
          )}",
})`,
          dependencies: [`@prisma/client`],
          envs: [],
          code_before_betterAuth: "const client = new PrismaClient();",
          imports: [
            {
              path: "better-auth/adapters/prisma",
              variables: [
                {
                  name: "prismaAdapter"
                }
              ]
            },
            {
              path: "@prisma/client",
              variables: [
                {
                  name: "PrismaClient"
                }
              ]
            }
          ]
        });
      } else if (opts.database === "mongodb") {
        await add_db({
          db_code: `mongodbAdapter(db)`,
          dependencies: ["mongodb"],
          envs: [`DATABASE_URL`],
          code_before_betterAuth: [
            `const client = new MongoClient(process.env.DATABASE_URL || "mongodb://localhost:27017/database");`,
            `const db = client.db();`
          ].join("\n"),
          imports: [
            {
              path: "better-auth/adapters/mongo",
              variables: [
                {
                  name: "mongodbAdapter"
                }
              ]
            },
            {
              path: "mongodb",
              variables: [
                {
                  name: "MongoClient"
                }
              ]
            }
          ]
        });
      }
      let start_of_betterauth = getGroupInfo(
        opts.config,
        common_indexes.START_OF_BETTERAUTH,
        {}
      );
      if (!start_of_betterauth) {
        throw new Error("Couldn't find start of betterAuth() function.");
      }
      let new_content;
      new_content = insertContent({
        line: start_of_betterauth.line,
        character: start_of_betterauth.character,
        content: opts.config,
        insert_content: `database: ${database_code_str},`
      });
      try {
        new_content = await format(new_content);
        return {
          code: new_content,
          dependencies: required_deps,
          envs: required_envs
        };
      } catch (error) {
        console.error(error);
        throw new Error(
          `Failed to generate new auth config during database addition phase.`
        );
      }
    }
  };
  let new_user_config = await format(current_user_config);
  let total_dependencies = [];
  let total_envs = [];
  if (plugins.length !== 0) {
    const imports = [];
    for await (const plugin of plugins) {
      const existingIndex = imports.findIndex((x) => x.path === plugin.path);
      if (existingIndex !== -1) {
        imports[existingIndex].variables.push({
          name: plugin.name,
          asType: false
        });
      } else {
        imports.push({
          path: plugin.path,
          variables: [
            {
              name: plugin.name,
              asType: false
            }
          ]
        });
      }
    }
    if (imports.length !== 0) {
      const { code, envs, dependencies } = await config_generation.add_import({
        config: new_user_config,
        imports
      });
      total_dependencies.push(...dependencies);
      total_envs.push(...envs);
      new_user_config = code;
    }
  }
  for await (const plugin of plugins) {
    try {
      let pluginContents = "";
      if (plugin.id === "magic-link") {
        pluginContents = `{
sendMagicLink({ email, token, url }, request) {
// Send email with magic link
},
}`;
      } else if (plugin.id === "email-otp") {
        pluginContents = `{
async sendVerificationOTP({ email, otp, type }, request) {
// Send email with OTP
},
}`;
      } else if (plugin.id === "generic-oauth") {
        pluginContents = `{
config: [],
}`;
      } else if (plugin.id === "oidc") {
        pluginContents = `{
loginPage: "/sign-in",
}`;
      }
      const { code, dependencies, envs } = await config_generation.add_plugin({
        config: new_user_config,
        direction_in_plugins_array: plugin.id === "next-cookies" ? "append" : "prepend",
        pluginFunctionName: plugin.name,
        pluginContents
      });
      new_user_config = code;
      total_envs.push(...envs);
      total_dependencies.push(...dependencies);
    } catch (error) {
      spinner.stop(
        `Something went wrong while generating/updating your new auth config file.`,
        1
      );
      logger.error(error.message);
      process.exit(1);
    }
  }
  if (database) {
    try {
      const { code, dependencies, envs } = await config_generation.add_database(
        {
          config: new_user_config,
          database
        }
      );
      new_user_config = code;
      total_dependencies.push(...dependencies);
      total_envs.push(...envs);
    } catch (error) {
      spinner.stop(
        `Something went wrong while generating/updating your new auth config file.`,
        1
      );
      logger.error(error.message);
      process.exit(1);
    }
  }
  return {
    generatedCode: new_user_config,
    dependencies: total_dependencies,
    envs: total_envs
  };
}
function findClosingBracket(content, startIndex, openingBracket, closingBracket) {
  let stack = 0;
  let inString = false;
  let quoteChar = null;
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    if (char === '"' || char === "'" || char === "`") {
      if (!inString) {
        inString = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inString = false;
        quoteChar = null;
      }
      continue;
    }
    if (!inString) {
      if (char === openingBracket) {
        stack++;
      } else if (char === closingBracket) {
        if (stack === 0) {
          return i;
        }
        stack--;
      }
    }
  }
  return null;
}
function insertContent(params) {
  const { line, character, content, insert_content } = params;
  const lines = content.split("\n");
  if (line < 1 || line > lines.length) {
    throw new Error("Invalid line number");
  }
  const targetLineIndex = line - 1;
  if (character < 0 || character > lines[targetLineIndex].length) {
    throw new Error("Invalid character index");
  }
  const targetLine = lines[targetLineIndex];
  const updatedLine = targetLine.slice(0, character) + insert_content + targetLine.slice(character);
  lines[targetLineIndex] = updatedLine;
  return lines.join("\n");
}
function getGroupInfo(content, commonIndexConfig, additionalFields) {
  if (commonIndexConfig.type === "regex") {
    const { regex, getIndex } = commonIndexConfig;
    const match = regex.exec(content);
    if (match) {
      const matchIndex = match.index;
      const groupIndex = getIndex({ matchIndex, match, additionalFields });
      if (groupIndex === null) return null;
      const position = getPosition(content, groupIndex);
      return {
        line: position.line,
        character: position.character,
        index: groupIndex
      };
    }
    return null;
  } else {
    const { getIndex } = commonIndexConfig;
    const index = getIndex({ content, additionalFields });
    if (index === null) return null;
    const { line, character } = getPosition(content, index);
    return {
      line,
      character,
      index
    };
  }
}
const getPosition = (str, index) => {
  const lines = str.slice(0, index).split("\n");
  return {
    line: lines.length,
    character: lines[lines.length - 1].length
  };
};

function stripJsonComments(jsonString) {
  return jsonString.replace(
    /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
    (m, g) => g ? "" : m
  ).replace(/,(?=\s*[}\]])/g, "");
}
function getTsconfigInfo(cwd, flatPath) {
  let tsConfigPath;
  if (flatPath) {
    tsConfigPath = flatPath;
  } else {
    tsConfigPath = cwd ? path.join(cwd, "tsconfig.json") : path.join("tsconfig.json");
  }
  try {
    const text = fs.readFileSync(tsConfigPath, "utf-8");
    return JSON.parse(stripJsonComments(text));
  } catch (error) {
    throw error;
  }
}

const supportedDatabases = [
  // Built-in kysely
  "sqlite",
  "mysql",
  "mssql",
  "postgres",
  // Drizzle
  "drizzle:pg",
  "drizzle:mysql",
  "drizzle:sqlite",
  // Prisma
  "prisma:postgresql",
  "prisma:mysql",
  "prisma:sqlite",
  // Mongo
  "mongodb"
];
const supportedPlugins = [
  {
    id: "two-factor",
    name: "twoFactor",
    path: `better-auth/plugins`,
    clientName: "twoFactorClient",
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "username",
    name: "username",
    clientName: "usernameClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "anonymous",
    name: "anonymous",
    clientName: "anonymousClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "phone-number",
    name: "phoneNumber",
    clientName: "phoneNumberClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "magic-link",
    name: "magicLink",
    clientName: "magicLinkClient",
    clientPath: "better-auth/client/plugins",
    path: `better-auth/plugins`
  },
  {
    id: "email-otp",
    name: "emailOTP",
    clientName: "emailOTPClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "passkey",
    name: "passkey",
    clientName: "passkeyClient",
    path: `better-auth/plugins/passkey`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "generic-oauth",
    name: "genericOAuth",
    clientName: "genericOAuthClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "one-tap",
    name: "oneTap",
    clientName: "oneTapClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "api-key",
    name: "apiKey",
    clientName: "apiKeyClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "admin",
    name: "admin",
    clientName: "adminClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "organization",
    name: "organization",
    clientName: "organizationClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "oidc",
    name: "oidcProvider",
    clientName: "oidcClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "sso",
    name: "sso",
    clientName: "ssoClient",
    path: `better-auth/plugins/sso`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "bearer",
    name: "bearer",
    clientName: void 0,
    path: `better-auth/plugins`,
    clientPath: void 0
  },
  {
    id: "multi-session",
    name: "multiSession",
    clientName: "multiSessionClient",
    path: `better-auth/plugins`,
    clientPath: "better-auth/client/plugins"
  },
  {
    id: "oauth-proxy",
    name: "oAuthProxy",
    clientName: void 0,
    path: `better-auth/plugins`,
    clientPath: void 0
  },
  {
    id: "open-api",
    name: "openAPI",
    clientName: void 0,
    path: `better-auth/plugins`,
    clientPath: void 0
  },
  {
    id: "jwt",
    name: "jwt",
    clientName: void 0,
    clientPath: void 0,
    path: `better-auth/plugins`
  },
  {
    id: "next-cookies",
    name: "nextCookies",
    clientPath: void 0,
    clientName: void 0,
    path: `better-auth/next-js`
  }
];
const defaultFormatOptions = {
  trailingComma: "all",
  useTabs: false,
  tabWidth: 4
};
const getDefaultAuthConfig = async ({ appName }) => await format(
  [
    "import { betterAuth } from 'better-auth';",
    "",
    "export const auth = betterAuth({",
    appName ? `appName: "${appName}",` : "",
    "plugins: [],",
    "});"
  ].join("\n"),
  {
    filepath: "auth.ts",
    ...defaultFormatOptions
  }
);
const getDefaultAuthClientConfig = async ({
  auth_config_path,
  framework,
  clientPlugins
}) => {
  function groupImportVariables() {
    const result = [
      {
        path: "better-auth/client/plugins",
        variables: [{ name: "inferAdditionalFields" }]
      }
    ];
    for (const plugin of clientPlugins) {
      for (const import_ of plugin.imports) {
        if (Array.isArray(import_.variables)) {
          for (const variable of import_.variables) {
            const existingIndex = result.findIndex(
              (x) => x.path === import_.path
            );
            if (existingIndex !== -1) {
              const vars = result[existingIndex].variables;
              if (Array.isArray(vars)) {
                vars.push(variable);
              } else {
                result[existingIndex].variables = [vars, variable];
              }
            } else {
              result.push({
                path: import_.path,
                variables: [variable]
              });
            }
          }
        } else {
          const existingIndex = result.findIndex(
            (x) => x.path === import_.path
          );
          if (existingIndex !== -1) {
            const vars = result[existingIndex].variables;
            if (Array.isArray(vars)) {
              vars.push(import_.variables);
            } else {
              result[existingIndex].variables = [vars, import_.variables];
            }
          } else {
            result.push({
              path: import_.path,
              variables: [import_.variables]
            });
          }
        }
      }
    }
    return result;
  }
  let imports = groupImportVariables();
  let importString = "";
  for (const import_ of imports) {
    if (Array.isArray(import_.variables)) {
      importString += `import { ${import_.variables.map(
        (x) => `${x.asType ? "type " : ""}${x.name}${x.as ? ` as ${x.as}` : ""}`
      ).join(", ")} } from "${import_.path}";
`;
    } else {
      importString += `import ${import_.variables.asType ? "type " : ""}${import_.variables.name}${import_.variables.as ? ` as ${import_.variables.as}` : ""} from "${import_.path}";
`;
    }
  }
  return await format(
    [
      `import { createAuthClient } from "better-auth/${framework === "nextjs" ? "react" : framework === "vanilla" ? "client" : framework}";`,
      `import type { auth } from "${auth_config_path}";`,
      importString,
      ``,
      `export const authClient = createAuthClient({`,
      `baseURL: "http://localhost:3000",`,
      `plugins: [inferAdditionalFields<typeof auth>(),${clientPlugins.map((x) => `${x.name}(${x.contents})`).join(", ")}],`,
      `});`
    ].join("\n"),
    {
      filepath: "auth-client.ts",
      ...defaultFormatOptions
    }
  );
};
const optionsSchema = z.object({
  cwd: z.string(),
  config: z.string().optional(),
  database: z.enum(supportedDatabases).optional(),
  "skip-db": z.boolean().optional(),
  "skip-plugins": z.boolean().optional(),
  "package-manager": z.string().optional(),
  tsconfig: z.string().optional()
});
const outroText = `\u{1F973} All Done, Happy Hacking!`;
async function initAction(opts) {
  console.log();
  intro("\u{1F44B} Initializing Better Auth");
  const options = optionsSchema.parse(opts);
  const cwd = path.resolve(options.cwd);
  let packageManagerPreference = void 0;
  let config_path = "";
  let framework = "vanilla";
  const format$1 = async (code) => await format(code, {
    filepath: config_path,
    ...defaultFormatOptions
  });
  let packageInfo;
  try {
    packageInfo = getPackageInfo(cwd);
  } catch (error) {
    log.error(`\u274C Couldn't read your package.json file. (dir: ${cwd})`);
    log.error(JSON.stringify(error, null, 2));
    process.exit(1);
  }
  const envFiles = await getEnvFiles(cwd);
  if (!envFiles.length) {
    outro("\u274C No .env files found. Please create an env file first.");
    process.exit(0);
  }
  let targetEnvFile;
  if (envFiles.includes(".env")) targetEnvFile = ".env";
  else if (envFiles.includes(".env.local")) targetEnvFile = ".env.local";
  else if (envFiles.includes(".env.development"))
    targetEnvFile = ".env.development";
  else if (envFiles.length === 1) targetEnvFile = envFiles[0];
  else targetEnvFile = "none";
  let tsconfigInfo;
  try {
    const tsconfigPath = options.tsconfig !== void 0 ? path.resolve(cwd, options.tsconfig) : path.join(cwd, "tsconfig.json");
    tsconfigInfo = await getTsconfigInfo(cwd, tsconfigPath);
  } catch (error) {
    log.error(`\u274C Couldn't read your tsconfig.json file. (dir: ${cwd})`);
    console.error(error);
    process.exit(1);
  }
  if (!("compilerOptions" in tsconfigInfo && "strict" in tsconfigInfo.compilerOptions && tsconfigInfo.compilerOptions.strict === true)) {
    log.warn(
      `Better Auth requires your tsconfig.json to have "compilerOptions.strict" set to true.`
    );
    const shouldAdd = await confirm({
      message: `Would you like us to set ${chalk.bold(
        `strict`
      )} to ${chalk.bold(`true`)}?`
    });
    if (isCancel(shouldAdd)) {
      cancel(`\u270B Operation cancelled.`);
      process.exit(0);
    }
    if (shouldAdd) {
      try {
        await fs$1.writeFile(
          path.join(cwd, "tsconfig.json"),
          await format(
            JSON.stringify(
              Object.assign(tsconfigInfo, {
                compilerOptions: {
                  strict: true
                }
              })
            ),
            { filepath: "tsconfig.json", ...defaultFormatOptions }
          ),
          "utf-8"
        );
        log.success(`\u{1F680} tsconfig.json successfully updated!`);
      } catch (error) {
        log.error(
          `Failed to add "compilerOptions.strict" to your tsconfig.json file.`
        );
        console.error(error);
        process.exit(1);
      }
    }
  }
  const s = spinner({ indicator: "dots" });
  s.start(`Checking better-auth installation`);
  let latest_betterauth_version;
  try {
    latest_betterauth_version = await getLatestNpmVersion("better-auth");
  } catch (error) {
    log.error(`\u274C Couldn't get latest version of better-auth.`);
    console.error(error);
    process.exit(1);
  }
  if (!packageInfo.dependencies || !Object.keys(packageInfo.dependencies).includes("better-auth")) {
    s.stop("Finished fetching latest version of better-auth.");
    const s2 = spinner({ indicator: "dots" });
    const shouldInstallBetterAuthDep = await confirm({
      message: `Would you like to install Better Auth?`
    });
    if (isCancel(shouldInstallBetterAuthDep)) {
      cancel(`\u270B Operation cancelled.`);
      process.exit(0);
    }
    if (packageManagerPreference === void 0) {
      packageManagerPreference = await getPackageManager();
    }
    if (shouldInstallBetterAuthDep) {
      s2.start(
        `Installing Better Auth using ${chalk.bold(packageManagerPreference)}`
      );
      try {
        const start = Date.now();
        await installDependencies({
          dependencies: ["better-auth@latest"],
          packageManager: packageManagerPreference,
          cwd
        });
        s2.stop(
          `Better Auth installed ${chalk.greenBright(
            `successfully`
          )}! ${chalk.gray(`(${formatMilliseconds(Date.now() - start)})`)}`
        );
      } catch (error) {
        s2.stop(`Failed to install Better Auth:`);
        console.error(error);
        process.exit(1);
      }
    }
  } else if (packageInfo.dependencies["better-auth"] !== "workspace:*" && semver.lt(
    semver.coerce(packageInfo.dependencies["better-auth"])?.toString(),
    semver.clean(latest_betterauth_version)
  )) {
    s.stop("Finished fetching latest version of better-auth.");
    const shouldInstallBetterAuthDep = await confirm({
      message: `Your current Better Auth dependency is out-of-date. Would you like to update it? (${chalk.bold(
        packageInfo.dependencies["better-auth"]
      )} \u2192 ${chalk.bold(`v${latest_betterauth_version}`)})`
    });
    if (isCancel(shouldInstallBetterAuthDep)) {
      cancel(`\u270B Operation cancelled.`);
      process.exit(0);
    }
    if (shouldInstallBetterAuthDep) {
      if (packageManagerPreference === void 0) {
        packageManagerPreference = await getPackageManager();
      }
      const s2 = spinner({ indicator: "dots" });
      s2.start(
        `Updating Better Auth using ${chalk.bold(packageManagerPreference)}`
      );
      try {
        const start = Date.now();
        await installDependencies({
          dependencies: ["better-auth@latest"],
          packageManager: packageManagerPreference,
          cwd
        });
        s2.stop(
          `Better Auth updated ${chalk.greenBright(
            `successfully`
          )}! ${chalk.gray(`(${formatMilliseconds(Date.now() - start)})`)}`
        );
      } catch (error) {
        s2.stop(`Failed to update Better Auth:`);
        log.error(error.message);
        process.exit(1);
      }
    }
  } else {
    s.stop(`Better Auth dependencies are ${chalk.greenBright(`up to date`)}!`);
  }
  const packageJson = getPackageInfo(cwd);
  let appName;
  if (!packageJson.name) {
    const newAppName = await text({
      message: "What is the name of your application?"
    });
    if (isCancel(newAppName)) {
      cancel("\u270B Operation cancelled.");
      process.exit(0);
    }
    appName = newAppName;
  } else {
    appName = packageJson.name;
  }
  let possiblePaths = ["auth.ts", "auth.tsx", "auth.js", "auth.jsx"];
  possiblePaths = [
    ...possiblePaths,
    ...possiblePaths.map((it) => `lib/server/${it}`),
    ...possiblePaths.map((it) => `server/${it}`),
    ...possiblePaths.map((it) => `lib/${it}`),
    ...possiblePaths.map((it) => `utils/${it}`)
  ];
  possiblePaths = [
    ...possiblePaths,
    ...possiblePaths.map((it) => `src/${it}`),
    ...possiblePaths.map((it) => `app/${it}`)
  ];
  if (options.config) {
    config_path = path.join(cwd, options.config);
  } else {
    for (const possiblePath of possiblePaths) {
      const doesExist = existsSync(path.join(cwd, possiblePath));
      if (doesExist) {
        config_path = path.join(cwd, possiblePath);
        break;
      }
    }
  }
  let current_user_config = "";
  let database = null;
  let add_plugins = [];
  if (!config_path) {
    const shouldCreateAuthConfig = await select({
      message: `Would you like to create an auth config file?`,
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
      ]
    });
    if (isCancel(shouldCreateAuthConfig)) {
      cancel(`\u270B Operation cancelled.`);
      process.exit(0);
    }
    if (shouldCreateAuthConfig === "yes") {
      const shouldSetupDb = await confirm({
        message: `Would you like to set up your ${chalk.bold(`database`)}?`,
        initialValue: true
      });
      if (isCancel(shouldSetupDb)) {
        cancel(`\u270B Operating cancelled.`);
        process.exit(0);
      }
      if (shouldSetupDb) {
        const prompted_database = await select({
          message: "Choose a Database Dialect",
          options: supportedDatabases.map((it) => ({ value: it, label: it }))
        });
        if (isCancel(prompted_database)) {
          cancel(`\u270B Operating cancelled.`);
          process.exit(0);
        }
        database = prompted_database;
      }
      if (options["skip-plugins"] !== false) {
        const shouldSetupPlugins = await confirm({
          message: `Would you like to set up ${chalk.bold(`plugins`)}?`
        });
        if (isCancel(shouldSetupPlugins)) {
          cancel(`\u270B Operating cancelled.`);
          process.exit(0);
        }
        if (shouldSetupPlugins) {
          const prompted_plugins = await multiselect({
            message: "Select your new plugins",
            options: supportedPlugins.filter((x) => x.id !== "next-cookies").map((x) => ({ value: x.id, label: x.id })),
            required: false
          });
          if (isCancel(prompted_plugins)) {
            cancel(`\u270B Operating cancelled.`);
            process.exit(0);
          }
          add_plugins = prompted_plugins.map(
            (x) => supportedPlugins.find((y) => y.id === x)
          );
          const possible_next_config_paths = [
            "next.config.js",
            "next.config.ts",
            "next.config.mjs",
            ".next/server/next.config.js",
            ".next/server/next.config.ts",
            ".next/server/next.config.mjs"
          ];
          for (const possible_next_config_path of possible_next_config_paths) {
            if (existsSync(path.join(cwd, possible_next_config_path))) {
              framework = "nextjs";
              break;
            }
          }
          if (framework === "nextjs") {
            const result = await confirm({
              message: `It looks like you're using NextJS. Do you want to add the next-cookies plugin? ${chalk.bold(
                `(Recommended)`
              )}`
            });
            if (isCancel(result)) {
              cancel(`\u270B Operating cancelled.`);
              process.exit(0);
            }
            if (result) {
              add_plugins.push(
                supportedPlugins.find((x) => x.id === "next-cookies")
              );
            }
          }
        }
      }
      const filePath = path.join(cwd, "auth.ts");
      config_path = filePath;
      log.info(`Creating auth config file: ${filePath}`);
      try {
        current_user_config = await getDefaultAuthConfig({
          appName
        });
        const { dependencies, envs, generatedCode } = await generateAuthConfig({
          current_user_config,
          format: format$1,
          //@ts-ignore
          s,
          plugins: add_plugins,
          database
        });
        current_user_config = generatedCode;
        await fs$1.writeFile(filePath, current_user_config);
        config_path = filePath;
        log.success(`\u{1F680} Auth config file successfully created!`);
        if (envs.length !== 0) {
          log.info(
            `There are ${envs.length} environment variables for your database of choice.`
          );
          const shouldUpdateEnvs = await confirm({
            message: `Would you like us to update your ENV files?`
          });
          if (isCancel(shouldUpdateEnvs)) {
            cancel("\u270B Operation cancelled.");
            process.exit(0);
          }
          if (shouldUpdateEnvs) {
            const filesToUpdate = await multiselect({
              message: "Select the .env files you want to update",
              options: envFiles.map((x) => ({
                value: path.join(cwd, x),
                label: x
              })),
              required: false
            });
            if (isCancel(filesToUpdate)) {
              cancel("\u270B Operation cancelled.");
              process.exit(0);
            }
            if (filesToUpdate.length === 0) {
              log.info("No .env files to update. Skipping...");
            } else {
              try {
                await updateEnvs({
                  files: filesToUpdate,
                  envs,
                  isCommented: true
                });
              } catch (error) {
                log.error(`Failed to update .env files:`);
                log.error(JSON.stringify(error, null, 2));
                process.exit(1);
              }
              log.success(`\u{1F680} ENV files successfully updated!`);
            }
          }
        }
        if (dependencies.length !== 0) {
          log.info(
            `There are ${dependencies.length} dependencies to install. (${dependencies.map((x) => chalk.green(x)).join(", ")})`
          );
          const shouldInstallDeps = await confirm({
            message: `Would you like us to install dependencies?`
          });
          if (isCancel(shouldInstallDeps)) {
            cancel("\u270B Operation cancelled.");
            process.exit(0);
          }
          if (shouldInstallDeps) {
            const s2 = spinner({ indicator: "dots" });
            if (packageManagerPreference === void 0) {
              packageManagerPreference = await getPackageManager();
            }
            s2.start(
              `Installing dependencies using ${chalk.bold(
                packageManagerPreference
              )}...`
            );
            try {
              const start = Date.now();
              await installDependencies({
                dependencies,
                packageManager: packageManagerPreference,
                cwd
              });
              s2.stop(
                `Dependencies installed ${chalk.greenBright(
                  `successfully`
                )} ${chalk.gray(
                  `(${formatMilliseconds(Date.now() - start)})`
                )}`
              );
            } catch (error) {
              s2.stop(
                `Failed to install dependencies using ${packageManagerPreference}:`
              );
              log.error(error.message);
              process.exit(1);
            }
          }
        }
      } catch (error) {
        log.error(`Failed to create auth config file: ${filePath}`);
        console.error(error);
        process.exit(1);
      }
    } else if (shouldCreateAuthConfig === "no") {
      log.info(`Skipping auth config file creation.`);
    }
  } else {
    log.message();
    log.success(`Found auth config file. ${chalk.gray(`(${config_path})`)}`);
    log.message();
  }
  let possibleClientPaths = [
    "auth-client.ts",
    "auth-client.tsx",
    "auth-client.js",
    "auth-client.jsx",
    "client.ts",
    "client.tsx",
    "client.js",
    "client.jsx"
  ];
  possibleClientPaths = [
    ...possibleClientPaths,
    ...possibleClientPaths.map((it) => `lib/server/${it}`),
    ...possibleClientPaths.map((it) => `server/${it}`),
    ...possibleClientPaths.map((it) => `lib/${it}`),
    ...possibleClientPaths.map((it) => `utils/${it}`)
  ];
  possibleClientPaths = [
    ...possibleClientPaths,
    ...possibleClientPaths.map((it) => `src/${it}`),
    ...possibleClientPaths.map((it) => `app/${it}`)
  ];
  let authClientConfigPath = null;
  for (const possiblePath of possibleClientPaths) {
    const doesExist = existsSync(path.join(cwd, possiblePath));
    if (doesExist) {
      authClientConfigPath = path.join(cwd, possiblePath);
      break;
    }
  }
  if (!authClientConfigPath) {
    const choice = await select({
      message: `Would you like to create an auth client config file?`,
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
      ]
    });
    if (isCancel(choice)) {
      cancel(`\u270B Operation cancelled.`);
      process.exit(0);
    }
    if (choice === "yes") {
      authClientConfigPath = path.join(cwd, "auth-client.ts");
      log.info(`Creating auth client config file: ${authClientConfigPath}`);
      try {
        let contents = await getDefaultAuthClientConfig({
          auth_config_path: ("./" + path.join(config_path.replace(cwd, ""))).replace(".//", "./"),
          clientPlugins: add_plugins.filter((x) => x.clientName).map((plugin) => {
            let contents2 = "";
            if (plugin.id === "one-tap") {
              contents2 = `{ clientId: "MY_CLIENT_ID" }`;
            }
            return {
              contents: contents2,
              id: plugin.id,
              name: plugin.clientName,
              imports: [
                {
                  path: "better-auth/client/plugins",
                  variables: [{ name: plugin.clientName }]
                }
              ]
            };
          }),
          framework
        });
        await fs$1.writeFile(authClientConfigPath, contents);
        log.success(`\u{1F680} Auth client config file successfully created!`);
      } catch (error) {
        log.error(
          `Failed to create auth client config file: ${authClientConfigPath}`
        );
        log.error(JSON.stringify(error, null, 2));
        process.exit(1);
      }
    } else if (choice === "no") {
      log.info(`Skipping auth client config file creation.`);
    }
  } else {
    log.success(
      `Found auth client config file. ${chalk.gray(
        `(${authClientConfigPath})`
      )}`
    );
  }
  if (targetEnvFile !== "none") {
    try {
      const fileContents = await fs$1.readFile(
        path.join(cwd, targetEnvFile),
        "utf8"
      );
      const parsed = parse(fileContents);
      let isMissingSecret = false;
      let isMissingUrl = false;
      if (parsed.BETTER_AUTH_SECRET === void 0) isMissingSecret = true;
      if (parsed.BETTER_AUTH_URL === void 0) isMissingUrl = true;
      if (isMissingSecret || isMissingUrl) {
        let txt = "";
        if (isMissingSecret && !isMissingUrl)
          txt = chalk.bold(`BETTER_AUTH_SECRET`);
        else if (!isMissingSecret && isMissingUrl)
          txt = chalk.bold(`BETTER_AUTH_URL`);
        else
          txt = chalk.bold.underline(`BETTER_AUTH_SECRET`) + ` and ` + chalk.bold.underline(`BETTER_AUTH_URL`);
        log.warn(`Missing ${txt} in ${targetEnvFile}`);
        const shouldAdd = await select({
          message: `Do you want to add ${txt} to ${targetEnvFile}?`,
          options: [
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
            { label: "Choose other file(s)", value: "other" }
          ]
        });
        if (isCancel(shouldAdd)) {
          cancel(`\u270B Operation cancelled.`);
          process.exit(0);
        }
        let envs = [];
        if (isMissingSecret) {
          envs.push("BETTER_AUTH_SECRET");
        }
        if (isMissingUrl) {
          envs.push("BETTER_AUTH_URL");
        }
        if (shouldAdd === "yes") {
          try {
            await updateEnvs({
              files: [path.join(cwd, targetEnvFile)],
              envs,
              isCommented: false
            });
          } catch (error) {
            log.error(`Failed to add ENV variables to ${targetEnvFile}`);
            log.error(JSON.stringify(error, null, 2));
            process.exit(1);
          }
          log.success(`\u{1F680} ENV variables successfully added!`);
          if (isMissingUrl) {
            log.info(
              `Be sure to update your BETTER_AUTH_URL according to your app's needs.`
            );
          }
        } else if (shouldAdd === "no") {
          log.info(`Skipping ENV step.`);
        } else if (shouldAdd === "other") {
          if (!envFiles.length) {
            cancel("No env files found. Please create an env file first.");
            process.exit(0);
          }
          const envFilesToUpdate = await multiselect({
            message: "Select the .env files you want to update",
            options: envFiles.map((x) => ({
              value: path.join(cwd, x),
              label: x
            })),
            required: false
          });
          if (isCancel(envFilesToUpdate)) {
            cancel("\u270B Operation cancelled.");
            process.exit(0);
          }
          if (envFilesToUpdate.length === 0) {
            log.info("No .env files to update. Skipping...");
          } else {
            try {
              await updateEnvs({
                files: envFilesToUpdate,
                envs,
                isCommented: false
              });
            } catch (error) {
              log.error(`Failed to update .env files:`);
              log.error(JSON.stringify(error, null, 2));
              process.exit(1);
            }
            log.success(`\u{1F680} ENV files successfully updated!`);
          }
        }
      }
    } catch (error) {
    }
  }
  outro(outroText);
  console.log();
  process.exit(0);
}
const init = new Command("init").option("-c, --cwd <cwd>", "The working directory.", process.cwd()).option(
  "--config <config>",
  "The path to the auth configuration file. defaults to the first `auth.ts` file found."
).option("--tsconfig <tsconfig>", "The path to the tsconfig file.").option("--skip-db", "Skip the database setup.").option("--skip-plugins", "Skip the plugins setup.").option(
  "--package-manager <package-manager>",
  "The package manager you want to use."
).action(initAction);
async function getLatestNpmVersion(packageName) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    if (!response.ok) {
      throw new Error(`Package not found: ${response.statusText}`);
    }
    const data = await response.json();
    return data["dist-tags"].latest;
  } catch (error) {
    throw error?.message;
  }
}
async function getPackageManager() {
  const { hasBun, hasPnpm } = await checkPackageManagers();
  if (!hasBun && !hasPnpm) return "npm";
  const packageManagerOptions = [];
  if (hasPnpm) {
    packageManagerOptions.push({
      value: "pnpm",
      label: "pnpm",
      hint: "recommended"
    });
  }
  if (hasBun) {
    packageManagerOptions.push({
      value: "bun",
      label: "bun"
    });
  }
  packageManagerOptions.push({
    value: "npm",
    hint: "not recommended"
  });
  let packageManager = await select({
    message: "Choose a package manager",
    options: packageManagerOptions
  });
  if (isCancel(packageManager)) {
    cancel(`Operation cancelled.`);
    process.exit(0);
  }
  return packageManager;
}
async function getEnvFiles(cwd) {
  const files = await fs$1.readdir(cwd);
  return files.filter((x) => x.startsWith(".env"));
}
async function updateEnvs({
  envs,
  files,
  isCommented
}) {
  let previouslyGeneratedSecret = null;
  for (const file of files) {
    const content = await fs$1.readFile(file, "utf8");
    const lines = content.split("\n");
    const newLines = envs.map(
      (x) => `${isCommented ? "# " : ""}${x}=${getEnvDescription(x) ?? `"some_value"`}`
    );
    newLines.push("");
    newLines.push(...lines);
    await fs$1.writeFile(file, newLines.join("\n"), "utf8");
  }
  function getEnvDescription(env) {
    if (env === "DATABASE_HOST") {
      return `"The host of your database"`;
    }
    if (env === "DATABASE_PORT") {
      return `"The port of your database"`;
    }
    if (env === "DATABASE_USER") {
      return `"The username of your database"`;
    }
    if (env === "DATABASE_PASSWORD") {
      return `"The password of your database"`;
    }
    if (env === "DATABASE_NAME") {
      return `"The name of your database"`;
    }
    if (env === "DATABASE_URL") {
      return `"The URL of your database"`;
    }
    if (env === "BETTER_AUTH_SECRET") {
      previouslyGeneratedSecret = previouslyGeneratedSecret ?? generateSecretHash();
      return `"${previouslyGeneratedSecret}"`;
    }
    if (env === "BETTER_AUTH_URL") {
      return `"http://localhost:3000" # Your APP URL`;
    }
  }
}

function addSvelteKitEnvModules(aliases) {
  aliases["$env/dynamic/private"] = createDataUriModule(
    createDynamicEnvModule()
  );
  aliases["$env/dynamic/public"] = createDataUriModule(
    createDynamicEnvModule()
  );
  aliases["$env/static/private"] = createDataUriModule(
    createStaticEnvModule(filterPrivateEnv("PUBLIC_", ""))
  );
  aliases["$env/static/public"] = createDataUriModule(
    createStaticEnvModule(filterPublicEnv("PUBLIC_", ""))
  );
}
function createDataUriModule(module) {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`;
}
function createStaticEnvModule(env) {
  const declarations = Object.keys(env).filter((k) => validIdentifier.test(k) && !reserved.has(k)).map((k) => `export const ${k} = ${JSON.stringify(env[k])};`);
  return `
  ${declarations.join("\n")}
  // jiti dirty hack: .unknown
  `;
}
function createDynamicEnvModule() {
  return `
  export const env = process.env;
  // jiti dirty hack: .unknown
  `;
}
function filterPrivateEnv(publicPrefix, privatePrefix) {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => k.startsWith(privatePrefix) && (!k.startsWith(publicPrefix))
    )
  );
}
function filterPublicEnv(publicPrefix, privatePrefix) {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => k.startsWith(publicPrefix) && (privatePrefix === "")
    )
  );
}
const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const reserved = /* @__PURE__ */ new Set([
  "do",
  "if",
  "in",
  "for",
  "let",
  "new",
  "try",
  "var",
  "case",
  "else",
  "enum",
  "eval",
  "null",
  "this",
  "true",
  "void",
  "with",
  "await",
  "break",
  "catch",
  "class",
  "const",
  "false",
  "super",
  "throw",
  "while",
  "yield",
  "delete",
  "export",
  "import",
  "public",
  "return",
  "static",
  "switch",
  "typeof",
  "default",
  "extends",
  "finally",
  "package",
  "private",
  "continue",
  "debugger",
  "function",
  "arguments",
  "interface",
  "protected",
  "implements",
  "instanceof"
]);

let possiblePaths = [
  "auth.ts",
  "auth.tsx",
  "auth.js",
  "auth.jsx",
  "auth.server.js",
  "auth.server.ts"
];
possiblePaths = [
  ...possiblePaths,
  ...possiblePaths.map((it) => `lib/server/${it}`),
  ...possiblePaths.map((it) => `server/${it}`),
  ...possiblePaths.map((it) => `lib/${it}`),
  ...possiblePaths.map((it) => `utils/${it}`)
];
possiblePaths = [
  ...possiblePaths,
  ...possiblePaths.map((it) => `src/${it}`),
  ...possiblePaths.map((it) => `app/${it}`)
];
function getPathAliases(cwd) {
  const tsConfigPath = path.join(cwd, "tsconfig.json");
  if (!fs$2.existsSync(tsConfigPath)) {
    return null;
  }
  try {
    const tsConfig = getTsconfigInfo(cwd);
    const { paths = {}, baseUrl = "." } = tsConfig.compilerOptions || {};
    const result = {};
    const obj = Object.entries(paths);
    for (const [alias, aliasPaths] of obj) {
      for (const aliasedPath of aliasPaths) {
        const resolvedBaseUrl = path.join(cwd, baseUrl);
        const finalAlias = alias.slice(-1) === "*" ? alias.slice(0, -1) : alias;
        const finalAliasedPath = aliasedPath.slice(-1) === "*" ? aliasedPath.slice(0, -1) : aliasedPath;
        result[finalAlias || ""] = path.join(resolvedBaseUrl, finalAliasedPath);
      }
    }
    addSvelteKitEnvModules(result);
    return result;
  } catch (error) {
    console.error(error);
    throw new BetterAuthError("Error parsing tsconfig.json");
  }
}
const jitiOptions = (cwd) => {
  const alias = getPathAliases(cwd) || {};
  return {
    transformOptions: {
      babel: {
        presets: [
          [
            babelPresetTypeScript,
            {
              isTSX: true,
              allExtensions: true
            }
          ],
          [babelPresetReact, { runtime: "automatic" }]
        ]
      }
    },
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    alias
  };
};
async function getConfig({
  cwd,
  configPath,
  shouldThrowOnError = false
}) {
  try {
    let configFile = null;
    if (configPath) {
      let resolvedPath = path.join(cwd, configPath);
      if (existsSync(configPath)) resolvedPath = configPath;
      const { config } = await loadConfig({
        configFile: resolvedPath,
        dotenv: true,
        jitiOptions: jitiOptions(cwd)
      });
      if (!config.auth && !config.default) {
        if (shouldThrowOnError) {
          throw new Error(
            `Couldn't read your auth config in ${resolvedPath}. Make sure to default export your auth instance or to export as a variable named auth.`
          );
        }
        logger.error(
          `[#better-auth]: Couldn't read your auth config in ${resolvedPath}. Make sure to default export your auth instance or to export as a variable named auth.`
        );
        process.exit(1);
      }
      configFile = config.auth?.options || config.default?.options || null;
    }
    if (!configFile) {
      for (const possiblePath of possiblePaths) {
        try {
          const { config } = await loadConfig({
            configFile: possiblePath,
            jitiOptions: jitiOptions(cwd)
          });
          const hasConfig = Object.keys(config).length > 0;
          if (hasConfig) {
            configFile = config.auth?.options || config.default?.options || null;
            if (!configFile) {
              if (shouldThrowOnError) {
                throw new Error(
                  "Couldn't read your auth config. Make sure to default export your auth instance or to export as a variable named auth."
                );
              }
              logger.error("[#better-auth]: Couldn't read your auth config.");
              console.log("");
              logger.info(
                "[#better-auth]: Make sure to default export your auth instance or to export as a variable named auth."
              );
              process.exit(1);
            }
            break;
          }
        } catch (e) {
          if (typeof e === "object" && e && "message" in e && typeof e.message === "string" && e.message.includes(
            "This module cannot be imported from a Client Component module"
          )) {
            if (shouldThrowOnError) {
              throw new Error(
                `Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`
              );
            }
            logger.error(
              `Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`
            );
            process.exit(1);
          }
          if (shouldThrowOnError) {
            throw e;
          }
          logger.error("[#better-auth]: Couldn't read your auth config.", e);
          process.exit(1);
        }
      }
    }
    return configFile;
  } catch (e) {
    if (typeof e === "object" && e && "message" in e && typeof e.message === "string" && e.message.includes(
      "This module cannot be imported from a Client Component module"
    )) {
      if (shouldThrowOnError) {
        throw new Error(
          `Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`
        );
      }
      logger.error(
        `Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`
      );
      process.exit(1);
    }
    if (shouldThrowOnError) {
      throw e;
    }
    logger.error("Couldn't read your auth config.", e);
    process.exit(1);
  }
}

async function migrateAction(opts) {
  const options = z.object({
    cwd: z.string(),
    config: z.string().optional(),
    y: z.boolean().optional(),
    yes: z.boolean().optional()
  }).parse(opts);
  const cwd = path.resolve(options.cwd);
  if (!existsSync(cwd)) {
    logger.error(`The directory "${cwd}" does not exist.`);
    process.exit(1);
  }
  const config = await getConfig({
    cwd,
    configPath: options.config
  });
  if (!config) {
    logger.error(
      "No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag."
    );
    return;
  }
  const db = await getAdapter(config);
  if (!db) {
    logger.error(
      "Invalid database configuration. Make sure you're not using adapters. Migrate command only works with built-in Kysely adapter."
    );
    process.exit(1);
  }
  if (db.id !== "kysely") {
    if (db.id === "prisma") {
      logger.error(
        "The migrate command only works with the built-in Kysely adapter. For Prisma, run `npx @better-auth/cli generate` to create the schema, then use Prisma\u2019s migrate or push to apply it."
      );
      try {
        const telemetry = await createTelemetry(config);
        await telemetry.publish({
          type: "cli_migrate",
          payload: {
            outcome: "unsupported_adapter",
            adapter: "prisma",
            config: getTelemetryAuthConfig(config)
          }
        });
      } catch {
      }
      process.exit(0);
    }
    if (db.id === "drizzle") {
      logger.error(
        "The migrate command only works with the built-in Kysely adapter. For Drizzle, run `npx @better-auth/cli generate` to create the schema, then use Drizzle\u2019s migrate or push to apply it."
      );
      try {
        const telemetry = await createTelemetry(config);
        await telemetry.publish({
          type: "cli_migrate",
          payload: {
            outcome: "unsupported_adapter",
            adapter: "drizzle",
            config: getTelemetryAuthConfig(config)
          }
        });
      } catch {
      }
      process.exit(0);
    }
    logger.error("Migrate command isn't supported for this adapter.");
    try {
      const telemetry = await createTelemetry(config);
      await telemetry.publish({
        type: "cli_migrate",
        payload: {
          outcome: "unsupported_adapter",
          adapter: db.id,
          config: getTelemetryAuthConfig(config)
        }
      });
    } catch {
    }
    process.exit(1);
  }
  const spinner = yoctoSpinner({ text: "preparing migration..." }).start();
  const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(config);
  if (!toBeAdded.length && !toBeCreated.length) {
    spinner.stop();
    logger.info("\u{1F680} No migrations needed.");
    try {
      const telemetry = await createTelemetry(config);
      await telemetry.publish({
        type: "cli_migrate",
        payload: {
          outcome: "no_changes",
          config: getTelemetryAuthConfig(config)
        }
      });
    } catch {
    }
    process.exit(0);
  }
  spinner.stop();
  logger.info(`\u{1F511} The migration will affect the following:`);
  for (const table of [...toBeCreated, ...toBeAdded]) {
    console.log(
      "->",
      chalk.magenta(Object.keys(table.fields).join(", ")),
      chalk.white("fields on"),
      chalk.yellow(`${table.table}`),
      chalk.white("table.")
    );
  }
  if (options.y) {
    console.warn("WARNING: --y is deprecated. Consider -y or --yes");
    options.yes = true;
  }
  let migrate2 = options.yes;
  if (!migrate2) {
    const response = await prompts({
      type: "confirm",
      name: "migrate",
      message: "Are you sure you want to run these migrations?",
      initial: false
    });
    migrate2 = response.migrate;
  }
  if (!migrate2) {
    logger.info("Migration cancelled.");
    try {
      const telemetry = await createTelemetry(config);
      await telemetry.publish({
        type: "cli_migrate",
        payload: { outcome: "aborted", config: getTelemetryAuthConfig(config) }
      });
    } catch {
    }
    process.exit(0);
  }
  spinner?.start("migrating...");
  await runMigrations();
  spinner.stop();
  logger.info("\u{1F680} migration was completed successfully!");
  try {
    const telemetry = await createTelemetry(config);
    await telemetry.publish({
      type: "cli_migrate",
      payload: { outcome: "migrated", config: getTelemetryAuthConfig(config) }
    });
  } catch {
  }
  process.exit(0);
}
const migrate = new Command("migrate").option(
  "-c, --cwd <cwd>",
  "the working directory. defaults to the current directory.",
  process.cwd()
).option(
  "--config <config>",
  "the path to the configuration file. defaults to the first configuration file found."
).option(
  "-y, --yes",
  "automatically accept and run migrations without prompting",
  false
).option("--y", "(deprecated) same as --yes", false).action(migrateAction);

function convertToSnakeCase(str, camelCase) {
  if (camelCase) {
    return str;
  }
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
const generateDrizzleSchema = async ({
  options,
  file,
  adapter
}) => {
  const tables = getAuthTables(options);
  const filePath = file || "./auth-schema.ts";
  const databaseType = adapter.options?.provider;
  if (!databaseType) {
    throw new Error(
      `Database provider type is undefined during Drizzle schema generation. Please define a \`provider\` in the Drizzle adapter config. Read more at https://better-auth.com/docs/adapters/drizzle`
    );
  }
  const fileExist = existsSync(filePath);
  let code = generateImport({ databaseType, tables, options });
  for (const tableKey in tables) {
    let getType = function(name, field) {
      if (!databaseType) {
        throw new Error(
          `Database provider type is undefined during Drizzle schema generation. Please define a \`provider\` in the Drizzle adapter config. Read more at https://better-auth.com/docs/adapters/drizzle`
        );
      }
      name = convertToSnakeCase(name, adapter.options?.camelCase);
      if (field.references?.field === "id") {
        if (options.advanced?.database?.useNumberId) {
          if (databaseType === "pg") {
            return `integer('${name}')`;
          } else if (databaseType === "mysql") {
            return `int('${name}')`;
          } else {
            return `integer('${name}')`;
          }
        }
        if (field.references.field) {
          if (databaseType === "mysql") {
            return `varchar('${name}', { length: 36 })`;
          }
        }
        return `text('${name}')`;
      }
      const type = field.type;
      const typeMap = {
        string: {
          sqlite: `text('${name}')`,
          pg: `text('${name}')`,
          mysql: field.unique ? `varchar('${name}', { length: 255 })` : field.references ? `varchar('${name}', { length: 36 })` : `text('${name}')`
        },
        boolean: {
          sqlite: `integer('${name}', { mode: 'boolean' })`,
          pg: `boolean('${name}')`,
          mysql: `boolean('${name}')`
        },
        number: {
          sqlite: `integer('${name}')`,
          pg: field.bigint ? `bigint('${name}', { mode: 'number' })` : `integer('${name}')`,
          mysql: field.bigint ? `bigint('${name}', { mode: 'number' })` : `int('${name}')`
        },
        date: {
          sqlite: `integer('${name}', { mode: 'timestamp' })`,
          pg: `timestamp('${name}')`,
          mysql: `timestamp('${name}')`
        },
        "number[]": {
          sqlite: `integer('${name}').array()`,
          pg: field.bigint ? `bigint('${name}', { mode: 'number' }).array()` : `integer('${name}').array()`,
          mysql: field.bigint ? `bigint('${name}', { mode: 'number' }).array()` : `int('${name}').array()`
        },
        "string[]": {
          sqlite: `text('${name}').array()`,
          pg: `text('${name}').array()`,
          mysql: `text('${name}').array()`
        }
      };
      return typeMap[type][databaseType];
    };
    const table = tables[tableKey];
    const modelName = getModelName(table.modelName, adapter.options);
    const fields = table.fields;
    let id = "";
    if (options.advanced?.database?.useNumberId) {
      if (databaseType === "pg") {
        id = `serial("id").primaryKey()`;
      } else {
        id = `int("id").autoincrement.primaryKey()`;
      }
    } else {
      if (databaseType === "mysql") {
        id = `varchar('id', { length: 36 }).primaryKey()`;
      } else if (databaseType === "pg") {
        id = `text('id').primaryKey()`;
      } else {
        id = `text('id').primaryKey()`;
      }
    }
    const schema = `export const ${modelName} = ${databaseType}Table("${convertToSnakeCase(
      modelName,
      adapter.options?.camelCase
    )}", {
					id: ${id},
					${Object.keys(fields).map((field) => {
      const attr = fields[field];
      let type = getType(field, attr);
      if (attr.defaultValue) {
        if (typeof attr.defaultValue === "function") {
          type += `.$defaultFn(${attr.defaultValue})`;
        } else if (typeof attr.defaultValue === "string") {
          type += `.default("${attr.defaultValue}")`;
        } else {
          type += `.default(${attr.defaultValue})`;
        }
      }
      return `${field}: ${type}${attr.required ? ".notNull()" : ""}${attr.unique ? ".unique()" : ""}${attr.references ? `.references(()=> ${getModelName(
        attr.references.model,
        adapter.options
      )}.${attr.references.field}, { onDelete: '${attr.references.onDelete || "cascade"}' })` : ""}`;
    }).join(",\n ")}
				});`;
    code += `
${schema}
`;
  }
  const formattedCode = await prettier.format(code, {
    parser: "typescript"
  });
  return {
    code: formattedCode,
    fileName: filePath,
    overwrite: fileExist
  };
};
function generateImport({
  databaseType,
  tables,
  options
}) {
  let imports = [];
  const hasBigint = Object.values(tables).some(
    (table) => Object.values(table.fields).some((field) => field.bigint)
  );
  const useNumberId = options.advanced?.database?.useNumberId;
  imports.push(`${databaseType}Table`);
  imports.push(
    databaseType === "mysql" ? "varchar, text" : databaseType === "pg" ? "text" : "text"
  );
  imports.push(hasBigint ? databaseType !== "sqlite" ? "bigint" : "" : "");
  imports.push(databaseType !== "sqlite" ? "timestamp, boolean" : "");
  imports.push(databaseType === "mysql" ? "int" : "integer");
  imports.push(useNumberId ? databaseType === "pg" ? "serial" : "" : "");
  return `import { ${imports.map((x) => x.trim()).filter((x) => x !== "").join(", ")} } from "drizzle-orm/${databaseType}-core";
`;
}
function getModelName(modelName, options) {
  return options?.usePlural ? `${modelName}s` : modelName;
}

const generatePrismaSchema = async ({
  adapter,
  options,
  file
}) => {
  const provider = adapter.options?.provider || "postgresql";
  const tables = getAuthTables(options);
  const filePath = file || "./prisma/schema.prisma";
  const schemaPrismaExist = existsSync(path.join(process.cwd(), filePath));
  let schemaPrisma = "";
  if (schemaPrismaExist) {
    schemaPrisma = await fs$1.readFile(
      path.join(process.cwd(), filePath),
      "utf-8"
    );
  } else {
    schemaPrisma = getNewPrisma(provider);
  }
  const manyToManyRelations = /* @__PURE__ */ new Map();
  for (const table in tables) {
    const fields = tables[table]?.fields;
    for (const field in fields) {
      const attr = fields[field];
      if (attr.references) {
        const referencedOriginalModel = attr.references.model;
        const referencedCustomModel = tables[referencedOriginalModel]?.modelName || referencedOriginalModel;
        const referencedModelNameCap = capitalizeFirstLetter(
          referencedCustomModel
        );
        if (!manyToManyRelations.has(referencedModelNameCap)) {
          manyToManyRelations.set(referencedModelNameCap, /* @__PURE__ */ new Set());
        }
        const currentCustomModel = tables[table]?.modelName || table;
        const currentModelNameCap = capitalizeFirstLetter(currentCustomModel);
        manyToManyRelations.get(referencedModelNameCap).add(currentModelNameCap);
      }
    }
  }
  const schema = produceSchema(schemaPrisma, (builder) => {
    for (const table in tables) {
      let getType = function({
        isBigint,
        isOptional,
        type
      }) {
        if (type === "string") {
          return isOptional ? "String?" : "String";
        }
        if (type === "number" && isBigint) {
          return isOptional ? "BigInt?" : "BigInt";
        }
        if (type === "number") {
          return isOptional ? "Int?" : "Int";
        }
        if (type === "boolean") {
          return isOptional ? "Boolean?" : "Boolean";
        }
        if (type === "date") {
          return isOptional ? "DateTime?" : "DateTime";
        }
        if (type === "string[]") {
          return isOptional ? "String[]" : "String[]";
        }
        if (type === "number[]") {
          return isOptional ? "Int[]" : "Int[]";
        }
      };
      const originalTableName = table;
      const customModelName = tables[table]?.modelName || table;
      const modelName = capitalizeFirstLetter(customModelName);
      const fields = tables[table]?.fields;
      const prismaModel = builder.findByType("model", {
        name: modelName
      });
      if (!prismaModel) {
        if (provider === "mongodb") {
          builder.model(modelName).field("id", "String").attribute("id").attribute(`map("_id")`);
        } else {
          if (options.advanced?.database?.useNumberId) {
            builder.model(modelName).field("id", "Int").attribute("id").attribute("default(autoincrement())");
          } else {
            builder.model(modelName).field("id", "String").attribute("id");
          }
        }
      }
      for (const field in fields) {
        const attr = fields[field];
        const fieldName = attr.fieldName || field;
        if (prismaModel) {
          const isAlreadyExist = builder.findByType("field", {
            name: fieldName,
            within: prismaModel.properties
          });
          if (isAlreadyExist) {
            continue;
          }
        }
        const fieldBuilder = builder.model(modelName).field(
          fieldName,
          field === "id" && options.advanced?.database?.useNumberId ? getType({
            isBigint: false,
            isOptional: false,
            type: "number"
          }) : getType({
            isBigint: attr?.bigint || false,
            isOptional: !attr?.required,
            type: attr.references?.field === "id" ? options.advanced?.database?.useNumberId ? "number" : "string" : attr.type
          })
        );
        if (field === "id") {
          fieldBuilder.attribute("id");
          if (provider === "mongodb") {
            fieldBuilder.attribute(`map("_id")`);
          }
        } else if (fieldName !== field) {
          fieldBuilder.attribute(`map("${field}")`);
        }
        if (attr.unique) {
          builder.model(modelName).blockAttribute(`unique([${fieldName}])`);
        }
        if (attr.references) {
          const referencedOriginalModelName = attr.references.model;
          const referencedCustomModelName = tables[referencedOriginalModelName]?.modelName || referencedOriginalModelName;
          let action = "Cascade";
          if (attr.references.onDelete === "no action") action = "NoAction";
          else if (attr.references.onDelete === "set null") action = "SetNull";
          else if (attr.references.onDelete === "set default")
            action = "SetDefault";
          else if (attr.references.onDelete === "restrict") action = "Restrict";
          builder.model(modelName).field(
            `${referencedCustomModelName.toLowerCase()}`,
            capitalizeFirstLetter(referencedCustomModelName)
          ).attribute(
            `relation(fields: [${fieldName}], references: [${attr.references.field}], onDelete: ${action})`
          );
        }
        if (!attr.unique && !attr.references && provider === "mysql" && attr.type === "string") {
          builder.model(modelName).field(fieldName).attribute("db.Text");
        }
      }
      if (manyToManyRelations.has(modelName)) {
        for (const relatedModel of manyToManyRelations.get(modelName)) {
          const fieldName = `${relatedModel.toLowerCase()}s`;
          const existingField = builder.findByType("field", {
            name: fieldName,
            within: prismaModel?.properties
          });
          if (!existingField) {
            builder.model(modelName).field(fieldName, `${relatedModel}[]`);
          }
        }
      }
      const hasAttribute = builder.findByType("attribute", {
        name: "map",
        within: prismaModel?.properties
      });
      const hasChanged = customModelName !== originalTableName;
      if (!hasAttribute) {
        builder.model(modelName).blockAttribute(
          "map",
          `${hasChanged ? customModelName : originalTableName}`
        );
      }
    }
  });
  const schemaChanged = schema.trim() !== schemaPrisma.trim();
  return {
    code: schemaChanged ? schema : "",
    fileName: filePath,
    overwrite: schemaPrismaExist && schemaChanged
  };
};
const getNewPrisma = (provider) => `generator client {
    provider = "prisma-client-js"
  }
  
  datasource db {
    provider = "${provider}"
    url      = ${provider === "sqlite" ? `"file:./dev.db"` : `env("DATABASE_URL")`}
  }`;

const generateMigrations = async ({
  options,
  file
}) => {
  const { compileMigrations } = await getMigrations(options);
  const migrations = await compileMigrations();
  return {
    code: migrations.trim() === ";" ? "" : migrations,
    fileName: file || `./better-auth_migrations/${(/* @__PURE__ */ new Date()).toISOString().replace(/:/g, "-")}.sql`
  };
};

const adapters = {
  prisma: generatePrismaSchema,
  drizzle: generateDrizzleSchema,
  kysely: generateMigrations
};
const generateSchema = (opts) => {
  const adapter = opts.adapter;
  const generator = adapter.id in adapters ? adapters[adapter.id] : null;
  if (generator) {
    return generator(opts);
  }
  if (adapter.createSchema) {
    return adapter.createSchema(opts.options, opts.file).then(({ code, path: fileName, overwrite }) => ({
      code,
      fileName,
      overwrite
    }));
  }
  logger.error(
    `${adapter.id} is not supported. If it is a custom adapter, please request the maintainer to implement createSchema`
  );
  process.exit(1);
};

async function generateAction(opts) {
  const options = z.object({
    cwd: z.string(),
    config: z.string().optional(),
    output: z.string().optional(),
    y: z.boolean().optional(),
    yes: z.boolean().optional()
  }).parse(opts);
  const cwd = path.resolve(options.cwd);
  if (!existsSync(cwd)) {
    logger.error(`The directory "${cwd}" does not exist.`);
    process.exit(1);
  }
  const config = await getConfig({
    cwd,
    configPath: options.config
  });
  if (!config) {
    logger.error(
      "No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag."
    );
    return;
  }
  const adapter = await getAdapter(config).catch((e) => {
    logger.error(e.message);
    process.exit(1);
  });
  const spinner = yoctoSpinner({ text: "preparing schema..." }).start();
  const schema = await generateSchema({
    adapter,
    file: options.output,
    options: config
  });
  spinner.stop();
  if (!schema.code) {
    logger.info("Your schema is already up to date.");
    try {
      const telemetry = await createTelemetry(config);
      await telemetry.publish({
        type: "cli_generate",
        payload: {
          outcome: "no_changes",
          config: getTelemetryAuthConfig(config, {
            adapter: adapter.id,
            database: typeof config.database === "function" ? "adapter" : "kysely"
          })
        }
      });
    } catch {
    }
    process.exit(0);
  }
  if (schema.overwrite) {
    let confirm2 = options.y || options.yes;
    if (!confirm2) {
      const response = await prompts({
        type: "confirm",
        name: "confirm",
        message: `The file ${schema.fileName} already exists. Do you want to ${chalk.yellow(
          `${schema.overwrite ? "overwrite" : "append"}`
        )} the schema to the file?`
      });
      confirm2 = response.confirm;
    }
    if (confirm2) {
      const exist = existsSync(path.join(cwd, schema.fileName));
      if (!exist) {
        await fs$1.mkdir(path.dirname(path.join(cwd, schema.fileName)), {
          recursive: true
        });
      }
      if (schema.overwrite) {
        await fs$1.writeFile(path.join(cwd, schema.fileName), schema.code);
      } else {
        await fs$1.appendFile(path.join(cwd, schema.fileName), schema.code);
      }
      logger.success(
        `\u{1F680} Schema was ${schema.overwrite ? "overwritten" : "appended"} successfully!`
      );
      try {
        const telemetry = await createTelemetry(config);
        await telemetry.publish({
          type: "cli_generate",
          payload: {
            outcome: schema.overwrite ? "overwritten" : "appended",
            config: getTelemetryAuthConfig(config)
          }
        });
      } catch {
      }
      process.exit(0);
    } else {
      logger.error("Schema generation aborted.");
      try {
        const telemetry = await createTelemetry(config);
        await telemetry.publish({
          type: "cli_generate",
          payload: {
            outcome: "aborted",
            config: getTelemetryAuthConfig(config)
          }
        });
      } catch {
      }
      process.exit(1);
    }
  }
  if (options.y) {
    console.warn("WARNING: --y is deprecated. Consider -y or --yes");
    options.yes = true;
  }
  let confirm = options.yes;
  if (!confirm) {
    const response = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Do you want to generate the schema to ${chalk.yellow(
        schema.fileName
      )}?`
    });
    confirm = response.confirm;
  }
  if (!confirm) {
    logger.error("Schema generation aborted.");
    try {
      const telemetry = await createTelemetry(config);
      await telemetry.publish({
        type: "cli_generate",
        payload: { outcome: "aborted", config: getTelemetryAuthConfig(config) }
      });
    } catch {
    }
    process.exit(1);
  }
  if (!options.output) {
    const dirExist = existsSync(path.dirname(path.join(cwd, schema.fileName)));
    if (!dirExist) {
      await fs$1.mkdir(path.dirname(path.join(cwd, schema.fileName)), {
        recursive: true
      });
    }
  }
  await fs$1.writeFile(
    options.output || path.join(cwd, schema.fileName),
    schema.code
  );
  logger.success(`\u{1F680} Schema was generated successfully!`);
  try {
    const telemetry = await createTelemetry(config);
    await telemetry.publish({
      type: "cli_generate",
      payload: { outcome: "generated", config: getTelemetryAuthConfig(config) }
    });
  } catch {
  }
  process.exit(0);
}
const generate = new Command("generate").option(
  "-c, --cwd <cwd>",
  "the working directory. defaults to the current directory.",
  process.cwd()
).option(
  "--config <config>",
  "the path to the configuration file. defaults to the first configuration file found."
).option("--output <output>", "the file to output to the generated schema").option("-y, --yes", "automatically answer yes to all prompts", false).option("--y", "(deprecated) same as --yes", false).action(generateAction);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
async function main() {
  const program = new Command("better-auth");
  let packageInfo = {};
  try {
    packageInfo = await getPackageInfo();
  } catch (error) {
  }
  program.addCommand(init).addCommand(migrate).addCommand(generate).addCommand(generateSecret).version(packageInfo.version || "1.1.2").description("Better Auth CLI").action(() => program.help());
  program.parse();
}
main();
