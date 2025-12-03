<img width="890" height="286" alt="Mistral Code" src="https://github.com/user-attachments/assets/4f1b5c86-a2ad-487e-9a8e-e90e2d5b83f8" />

A CLI agent powered by Mistral AI, similar to Claude Code. Interact with an AI assistant through a simple command-line interface that understands your codebase and helps with software engineering tasks.

## 🎥 Demo

![Demo](./demo.gif)

## How it works

### 📋 Plan mode

- Create step-by-step plans before making changes
- Read-only mode that explores your codebase without modifications
- Review and approve plans before implementation
- Use `/plan <message>` to enter plan mode, then `/approve` to start implementation

### 🛠️ Tools

- Read files - Understand code and examine file contents
- List directories - Explore codebase structure
- Edit files - Make precise code changes with string replacement
- Run commands - Execute shell commands, run tests, install dependencies, and more

## 🚀 Getting started

### Prerequisites

- Node.js (v20 or higher)
- A Mistral API key ([get one here](https://console.mistral.ai/))

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up your API key:

   Create a `.env` file in the root directory:

   ```bash
   echo "MISTRAL_API_KEY=your_api_key_here" > .env
   ```

   Or export it as an environment variable:

   ```bash
   export MISTRAL_API_KEY=your_api_key_here
   ```

3. Run the CLI:
   ```bash
   npm run dev
   ```

## 📖 Usage

Once running, you can interact with Mistral Code in several ways:

### Basic interaction

- Type any message to chat with the agent
- Ask questions about your codebase
- Request code changes, bug fixes, or new features

### Commands

- `help` - Show available commands and usage
- `clear` - Clear conversation history
- `exit` or `quit` - Exit the CLI

### Plan mode

Plan mode lets you create a detailed plan before making any changes:

1. Enter plan mode:

   ```
   /plan Create a new React component for user authentication
   ```

2. Review the plan:
   The agent will explore your codebase and create a step-by-step plan without making changes.

3. Approve and implement:

   ```
   /approve
   ```

   This exits plan mode and starts implementation.

4. Update the plan:
   While in plan mode, you can type additional messages to refine the plan before approval.

## 📝 License

MIT
