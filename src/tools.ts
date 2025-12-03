import type { Tool } from "@mistralai/mistralai/models/components";
import * as fs from "fs/promises";
import * as path from "path";

export type ReadFileArgs = {
  file_path: string;
};

export type ListDirectoryArgs = {
  directory_path?: string;
};

export type ToolRegistry = {
  read_file: ReadFileArgs;
  list_directory: ListDirectoryArgs;
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

export function isToolName(name: string): name is ToolName {
  return name === "read_file" || name === "list_directory";
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
