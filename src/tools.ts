import type { Tool } from "@mistralai/mistralai/models/components";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export type ReadFileArgs = {
  file_path: string;
};

export type ListDirectoryArgs = {
  directory_path?: string;
};

export type EditFileArgs = {
  file_path: string;
  old_str: string;
  new_str: string;
};

export type RunCommandArgs = {
  command: string;
  working_directory?: string;
};

export type ToolRegistry = {
  read_file: ReadFileArgs;
  list_directory: ListDirectoryArgs;
  edit_file: EditFileArgs;
  run_command: RunCommandArgs;
};

export type ToolName = keyof ToolRegistry;

export const readFileTool: Tool = {
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

export const listDirectoryTool: Tool = {
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

export const editFileTool: Tool = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "Edit a file by replacing a specific string with a new string. If old_str is empty, creates a new file with new_str. Returns success message or error.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "The path to the file to edit. Can be relative or absolute.",
        },
        old_str: {
          type: "string",
          description:
            "The exact string to replace in the file. Use empty string to create a new file.",
        },
        new_str: {
          type: "string",
          description: "The new string to replace old_str with.",
        },
      },
      required: ["file_path", "old_str", "new_str"],
    },
  },
};

export const runCommandTool: Tool = {
  type: "function",
  function: {
    name: "run_command",
    description:
      "Execute a shell command in the terminal. Returns the command output (stdout and stderr). Use this to run tests, install dependencies, build projects, or execute any CLI commands. Commands are executed in the specified working directory, or the current directory if not specified.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "The shell command to execute. Can be any valid bash/shell command.",
        },
        working_directory: {
          type: "string",
          description:
            "Optional working directory to execute the command in. Defaults to current directory if not provided.",
        },
      },
      required: ["command"],
    },
  },
};

export function isToolName(name: string): name is ToolName {
  return (
    name === "read_file" ||
    name === "list_directory" ||
    name === "edit_file" ||
    name === "run_command"
  );
}

export async function executeTool(
  toolName: "read_file",
  args: ReadFileArgs
): Promise<string>;
export async function executeTool(
  toolName: "list_directory",
  args: ListDirectoryArgs
): Promise<string>;
export async function executeTool(
  toolName: "edit_file",
  args: EditFileArgs
): Promise<string>;
export async function executeTool(
  toolName: "run_command",
  args: RunCommandArgs
): Promise<string>;
export async function executeTool(
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
    case "edit_file": {
      const editArgs = args as EditFileArgs;
      try {
        const filePath = editArgs.file_path;
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);

        if (editArgs.old_str === "") {
          // Creating a new file
          await fs.writeFile(resolvedPath, editArgs.new_str, "utf-8");
          return `File created successfully: ${filePath}`;
        } else {
          // Editing an existing file
          const content = await fs.readFile(resolvedPath, "utf-8");
          if (!content.includes(editArgs.old_str)) {
            return `Error: The specified old_str was not found in the file. Make sure to include the exact string including whitespace and newlines.`;
          }
          const newContent = content.replace(
            editArgs.old_str,
            editArgs.new_str
          );
          await fs.writeFile(resolvedPath, newContent, "utf-8");
          return `File edited successfully: ${filePath}`;
        }
      } catch (error) {
        return `Error editing file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    }
    case "run_command": {
      const runArgs = args as RunCommandArgs;
      try {
        const workingDir = runArgs.working_directory
          ? path.isAbsolute(runArgs.working_directory)
            ? runArgs.working_directory
            : path.resolve(process.cwd(), runArgs.working_directory)
          : process.cwd();

        const { stdout, stderr } = await execAsync(runArgs.command, {
          cwd: workingDir,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: 300000, // 5 minute timeout
        });

        let output = "";
        if (stdout) {
          output += stdout;
        }
        if (stderr) {
          output += stderr;
        }

        // If there's no output but command succeeded, indicate success
        if (!output.trim()) {
          return "Command executed successfully (no output)";
        }

        return output.trim();
      } catch (error: any) {
        // execAsync throws an error with stdout/stderr in the error object
        if (error.stdout || error.stderr) {
          let output = "";
          if (error.stdout) {
            output += error.stdout;
          }
          if (error.stderr) {
            output += error.stderr;
          }
          // Include exit code if available
          if (error.code !== undefined) {
            return `Command failed with exit code ${error.code}:\n${output.trim()}`;
          }
          return output.trim() || `Command failed: ${error.message}`;
        }
        return `Error executing command: ${
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
