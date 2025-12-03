import { Mistral } from "@mistralai/mistralai";
import "dotenv/config";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";

const apiKey = process.env.MISTRAL_API_KEY || "";
if (!apiKey) {
  console.error("Error: MISTRAL_API_KEY environment variable is required");
  console.error(
    "Please set it in your .env file or export it as an environment variable"
  );
  process.exit(1);
}

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

const readFileTool = {
  type: "function" as const,
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

async function executeTool(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "read_file": {
      try {
        const filePath = args.file_path as string;
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
    default:
      return `Unknown tool: ${toolName}`;
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

    const messages = [
      {
        role: "system" as const,
        content:
          "You are a helpful coding assistant similar to Claude Code. You help users with programming tasks, answer questions, and provide clear explanations. You can read files using the read_file tool when needed.",
      },
      ...conversationHistory.map((msg) => {
        if (msg.role === "tool") {
          return {
            role: "tool" as const,
            content: msg.content,
            toolCallId: msg.toolCallId!,
          };
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          return {
            role: "assistant" as const,
            content: msg.content,
            toolCalls: msg.toolCalls,
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
        messages: messages as any,
        tools: [readFileTool],
      });

      const choice = chatResponse.choices[0];
      if (!choice) {
        console.log("Agent: No response\n");
        break;
      }

      const message = choice.message;
      const toolCalls = message.toolCalls;

      if (toolCalls && toolCalls.length > 0) {
        const assistantMsg: any = {
          role: "assistant" as const,
          content: message.content || "",
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
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
          const functionArgs = JSON.parse(functionArgsStr);

          console.log(`\n🔧 Calling tool: ${functionName}`);
          console.log(`   Arguments: ${functionArgsStr}\n`);

          const result = await executeTool(functionName, functionArgs);

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
