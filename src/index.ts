import { Mistral } from "@mistralai/mistralai";
import "dotenv/config";
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

// Store conversation history
const conversationHistory: Array<{
  role: "user" | "assistant";
  content: string;
}> = [];

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

  // Add user message to history
  conversationHistory.push({ role: "user", content: trimmed });

  try {
    console.log("Thinking...\n");

    const chatResponse = await client.chat.complete({
      model: "mistral-medium-latest",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful coding assistant similar to Claude Code. You help users with programming tasks, answer questions, and provide clear explanations.",
        },
        ...conversationHistory,
      ],
    });

    const content = chatResponse.choices[0]?.message?.content;
    let assistantMessage: string;

    if (typeof content === "string") {
      assistantMessage = content;
    } else if (Array.isArray(content)) {
      // Handle ContentChunk[] - extract text from text chunks
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

    // Add assistant response to history
    conversationHistory.push({ role: "assistant", content: assistantMessage });
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    // Remove the last user message if there was an error
    conversationHistory.pop();
  }

  rl.prompt();
}

// Start the agentic loop
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
