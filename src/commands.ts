import { Mistral } from "@mistralai/mistralai";
import type {
  AssistantMessage,
  SystemMessage,
  ToolMessage,
  UserMessage,
} from "@mistralai/mistralai/models/components";
import chalk from "chalk";
import * as readline from "readline";
import {
  editFileTool,
  executeTool,
  isToolName,
  listDirectoryTool,
  readFileTool,
  runCommandTool,
  type EditFileArgs,
  type ListDirectoryArgs,
  type ReadFileArgs,
  type RunCommandArgs,
} from "./tools.js";

type ChatMessage =
  | (SystemMessage & { role: "system" })
  | (UserMessage & { role: "user" })
  | (AssistantMessage & { role: "assistant" })
  | (ToolMessage & { role: "tool" });

type ConversationMessage = {
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
};

export function createLoadingAnimation(): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;
  let interval: NodeJS.Timeout | null = null;

  const animate = () => {
    process.stdout.write(
      `\r${chalk.cyan(frames[frameIndex])} ${chalk.cyan("Thinking...")}`
    );
    frameIndex = (frameIndex + 1) % frames.length;
  };

  interval = setInterval(animate, 100);
  animate(); // Start immediately

  return () => {
    if (interval) {
      clearInterval(interval);
    }
    // Clear the line
    process.stdout.write("\r" + " ".repeat(50) + "\r");
  };
}

export async function processCommand(
  input: string,
  client: Mistral,
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  rl: readline.Interface
): Promise<void> {
  const trimmed = input.trim();

  if (trimmed === "exit" || trimmed === "quit") {
    console.log(chalk.cyan("👋 Goodbye!"));
    rl.close();
    return;
  }

  if (trimmed === "clear") {
    conversationHistory.length = 0;
    console.log(chalk.green("✓ Conversation history cleared.\n"));
    rl.prompt();
    return;
  }

  if (trimmed === "help") {
    console.log(
      chalk.blue(`
Available commands:
  - Type any message to chat with the agent
  - 'exit' or 'quit' - Exit the CLI
  - 'clear' - Clear conversation history
  - 'help' - Show this help message
`)
    );
    rl.prompt();
    return;
  }

  if (!trimmed) {
    rl.prompt();
    return;
  }

  conversationHistory.push({ role: "user", content: trimmed });

  const stopLoading = createLoadingAnimation();
  try {
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
        tools: [readFileTool, listDirectoryTool, editFileTool, runCommandTool],
      });

      const choice = chatResponse.choices[0];
      if (!choice) {
        stopLoading();
        console.log(chalk.red("✗ Mistral Code: No response\n"));
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
            console.error(chalk.red("✗ Tool call missing ID, skipping"));
            continue;
          }

          const functionName = toolCall.function.name;
          const functionArgsStr =
            typeof toolCall.function.arguments === "string"
              ? toolCall.function.arguments
              : JSON.stringify(toolCall.function.arguments);

          console.log(
            chalk.blue(
              `\n${chalk.bold("🔧")} Calling tool: ${chalk.yellow(
                functionName
              )}`
            )
          );
          console.log(
            chalk.gray(`   Arguments: ${chalk.gray(functionArgsStr)}\n`)
          );

          if (!isToolName(functionName)) {
            console.error(chalk.red(`✗ Unknown tool: ${functionName}`));
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
          } else if (functionName === "edit_file") {
            const functionArgs = JSON.parse(functionArgsStr) as EditFileArgs;
            result = await executeTool(functionName, functionArgs);
          } else if (functionName === "run_command") {
            const functionArgs = JSON.parse(functionArgsStr) as RunCommandArgs;
            result = await executeTool(functionName, functionArgs);
          } else {
            const _exhaustive: never = functionName;
            console.error(chalk.red(`✗ Unknown tool: ${functionName}`));
            continue;
          }

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

      stopLoading();
      console.log(
        chalk.bold.cyan("Mistral Code:") + ` ${chalk.white(assistantMessage)}\n`
      );

      conversationHistory.push({
        role: "assistant",
        content: assistantMessage,
      });

      break;
    }

    if (iteration >= maxIterations) {
      stopLoading();
      console.log(chalk.red("✗ Mistral Code: Maximum iterations reached\n"));
    }
  } catch (error) {
    stopLoading();
    console.error(
      chalk.red.bold("✗ Error:"),
      chalk.red(error instanceof Error ? error.message : "Unknown error")
    );
    conversationHistory.pop();
  }

  rl.prompt();
}
