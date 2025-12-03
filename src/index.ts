import { Mistral } from "@mistralai/mistralai";
import type {
  AssistantMessage,
  SystemMessage,
  Tool,
  ToolMessage,
  UserMessage,
} from "@mistralai/mistralai/models/components";
import "dotenv/config";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { SYSTEM_PROMPT } from "./prompt.js";

const apiKey = process.env.MISTRAL_API_KEY || "";
if (!apiKey) {
  console.error("Error: MISTRAL_API_KEY environment variable is required");
  console.error(
    "Please set it in your .env file or export it as an environment variable"
  );
  process.exit(1);
}

const systemPrompt = SYSTEM_PROMPT;

const client = new Mistral({ apiKey });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

const conversationHistory: Array<{
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}> = [];

type ReadFileArgs = {
  file_path: string;
};

type ListDirectoryArgs = {
  directory_path?: string;
};

type ToolRegistry = {
  read_file: ReadFileArgs;
  list_directory: ListDirectoryArgs;
};

type ToolName = keyof ToolRegistry;

const readFileTool: Tool = {
  type: "function",
  function: {
    name: "read_file",
    description:
      "Read the contents of a file from the filesystem. Returns the file content as a string.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "The path to the file to read. Can be relative or absolute.",
        },
      },
      required: ["file_path"],
    },
  },
};

const listDirectoryTool: Tool = {
  type: "function",
  function: {
    name: "list_directory",
    description:
      "List the contents of a directory. Returns a list of files and directories in the specified path.",
    parameters: {
      type: "object",
      properties: {
        directory_path: {
          type: "string",
          description:
            "The path to the directory to list. Can be relative or absolute. Defaults to current directory if not provided.",
        },
      },
      required: [],
    },
  },
};

function isToolName(name: string): name is ToolName {
  return name === "read_file" || name === "list_directory";
}

async function executeTool(
  toolName: "read_file",
  args: ReadFileArgs
): Promise<string>;
async function executeTool(
  toolName: "list_directory",
  args: ListDirectoryArgs
): Promise<string>;
async function executeTool(
  toolName: ToolName,
  args: ToolRegistry[ToolName]
): Promise<string> {
  switch (toolName) {
    case "read_file": {
      const readArgs = args as ReadFileArgs;
      try {
        const filePath = readArgs.file_path;
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);

        const content = await fs.readFile(resolvedPath, "utf-8");
        return content;
      } catch (error) {
        return `Error reading file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    }
    case "list_directory": {
      const listArgs = args as ListDirectoryArgs;
      try {
        const dirPath = listArgs.directory_path || ".";
        const resolvedPath = path.isAbsolute(dirPath)
          ? dirPath
          : path.resolve(process.cwd(), dirPath);

        const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
        const items = await Promise.all(
          entries.map(async (entry) => {
            const name = entry.name;
            const type = entry.isDirectory() ? "directory" : "file";
            let size = "";
            if (entry.isFile()) {
              try {
                const stats = await fs.stat(path.join(resolvedPath, name));
                size = ` (${stats.size} bytes)`;
              } catch {
                // Ignore stat errors
              }
            }
            return `${type === "directory" ? "📁" : "📄"} ${name}${size}`;
          })
        );
        return items.join("\n");
      } catch (error) {
        return `Error listing directory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    }
    default: {
      const _exhaustive: never = toolName;
      return `Unknown tool: ${toolName}`;
    }
  }
}

async function processCommand(input: string): Promise<void> {
  const trimmed = input.trim();

  if (trimmed === "exit" || trimmed === "quit") {
    console.log("Goodbye!");
    rl.close();
    return;
  }

  if (trimmed === "clear") {
    conversationHistory.length = 0;
    console.log("Conversation history cleared.\n");
    rl.prompt();
    return;
  }

  if (trimmed === "help") {
    console.log(`
Available commands:
  - Type any message to chat with the agent
  - 'exit' or 'quit' - Exit the CLI
  - 'clear' - Clear conversation history
  - 'help' - Show this help message
`);
    rl.prompt();
    return;
  }

  if (!trimmed) {
    rl.prompt();
    return;
  }

  conversationHistory.push({ role: "user", content: trimmed });

  try {
    console.log("Thinking...\n");

    type ChatMessage =
      | (SystemMessage & { role: "system" })
      | (UserMessage & { role: "user" })
      | (AssistantMessage & { role: "assistant" })
      | (ToolMessage & { role: "tool" });

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: systemPrompt.trim(),
      },
      ...conversationHistory.map((msg): ChatMessage => {
        if (msg.role === "tool" && msg.toolCallId) {
          return {
            role: "tool",
            content: msg.content,
            toolCallId: msg.toolCallId,
          };
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          return {
            role: "assistant",
            content: msg.content,
            toolCalls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: tc.type as "function",
              function: {
                name: tc.function.name,
                arguments:
                  typeof tc.function.arguments === "string"
                    ? tc.function.arguments
                    : JSON.stringify(tc.function.arguments),
              },
            })),
          };
        }
        return {
          role: msg.role as "user" | "assistant",
          content: msg.content,
        };
      }),
    ];

    let maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      const chatResponse = await client.chat.complete({
        model: "mistral-small-latest",
        messages,
        tools: [readFileTool, listDirectoryTool],
      });

      const choice = chatResponse.choices[0];
      if (!choice) {
        console.log("Agent: No response\n");
        break;
      }

      const message = choice.message;
      const toolCalls = message.toolCalls;

      if (toolCalls && toolCalls.length > 0) {
        const assistantMsg: AssistantMessage & { role: "assistant" } = {
          role: "assistant",
          content: message.content || "",
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id || "",
            type: tc.type || "function",
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
            },
          })),
        };
        messages.push(assistantMsg);

        for (const toolCall of toolCalls) {
          if (!toolCall.id) {
            console.error("Tool call missing ID, skipping");
            continue;
          }

          const functionName = toolCall.function.name;
          const functionArgsStr =
            typeof toolCall.function.arguments === "string"
              ? toolCall.function.arguments
              : JSON.stringify(toolCall.function.arguments);

          console.log(`\n🔧 Calling tool: ${functionName}`);
          console.log(`   Arguments: ${functionArgsStr}\n`);

          if (!isToolName(functionName)) {
            console.error(`Unknown tool: ${functionName}`);
            continue;
          }

          let result: string;
          if (functionName === "read_file") {
            const functionArgs = JSON.parse(functionArgsStr) as ReadFileArgs;
            result = await executeTool(functionName, functionArgs);
          } else if (functionName === "list_directory") {
            const functionArgs = JSON.parse(
              functionArgsStr
            ) as ListDirectoryArgs;
            result = await executeTool(functionName, functionArgs);
          } else {
            const _exhaustive: never = functionName;
            console.error(`Unknown tool: ${functionName}`);
            continue;
          }

          const resultPreview =
            result.length > 200
              ? result.substring(0, 200) + "... (truncated)"
              : result;
          console.log(`✅ Tool result: ${resultPreview}\n`);

          messages.push({
            role: "tool" as const,
            content: result,
            toolCallId: toolCall.id,
          });
        }

        continue;
      }

      const content = message.content;
      let assistantMessage: string;

      if (typeof content === "string") {
        assistantMessage = content;
      } else if (Array.isArray(content)) {
        assistantMessage = content
          .map((chunk) => {
            if (chunk.type === "text" && "text" in chunk) {
              return chunk.text;
            }
            return "";
          })
          .filter(Boolean)
          .join("");
      } else {
        assistantMessage = "No response";
      }

      if (!assistantMessage) {
        assistantMessage = "No response";
      }

      console.log(`Agent: ${assistantMessage}\n`);

      conversationHistory.push({
        role: "assistant",
        content: assistantMessage,
      });

      break;
    }

    if (iteration >= maxIterations) {
      console.log("Agent: Maximum iterations reached\n");
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    conversationHistory.pop();
  }

  rl.prompt();
}

console.log(
  'Mistral CLI Agent - Type your commands (or "help" for help, "exit" to quit)\n'
);
rl.prompt();

rl.on("line", (input) => {
  processCommand(input);
});

rl.on("close", () => {
  console.log("\nSession ended.");
  process.exit(0);
});
