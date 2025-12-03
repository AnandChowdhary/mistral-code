# Mistral Code

A CLI agent powered by Mistral AI, similar to Claude Code. Interact with an AI assistant through a simple command-line interface.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your API key:**
   
   Create a `.env` file in the root directory:
   ```bash
   echo "MISTRAL_API_KEY=your_api_key_here" > .env
   ```
   
   Or export it as an environment variable:
   ```bash
   export MISTRAL_API_KEY=your_api_key_here
   ```

3. **Run the CLI:**
   ```bash
   npm run dev
   ```

## Usage

Once running, you can:
- Type any message to chat with the agent
- Use `help` to see available commands
- Use `clear` to clear conversation history
- Use `exit` or `quit` to exit the CLI

## Commands

- `help` - Show help message
- `clear` - Clear conversation history
- `exit` or `quit` - Exit the CLI

## Development

- `npm run dev` - Run in development mode with tsx
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run the built version

## Project Structure

```
mistral-code/
├── src/
│   └── index.ts      # Main CLI agent code
├── dist/             # Compiled JavaScript (after build)
├── .env              # Environment variables (not in git)
├── package.json
├── tsconfig.json
└── README.md
```

