// src/tools/file.tools.ts
import { ToolDefinition } from "./types";
import { fsManager } from "../fs";

export const fileTools: ToolDefinition[] = [
    // Write File
    {
        name: "write_file",
        description: "Create or update a file in the project workspace",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Relative file path (e.g., 'src/api/auth.ts')"
                },
                content: {
                    type: "string",
                    description: "File content"
                }
            },
            required: ["path", "content"]
        },
        handler: async (params, context) => {
            try {
                await fsManager.writeFile(
                    context.projectId,
                    params.path,
                    params.content
                );

                return {
                    success: true,
                    data: {
                        path: params.path,
                        size: params.content.length
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Read File
    {
        name: "read_file",
        description: "Read content of a file from the project workspace",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Relative file path"
                }
            },
            required: ["path"]
        },
        handler: async (params, context) => {
            try {
                const content = await fsManager.readFile(
                    context.projectId,
                    params.path
                );

                return {
                    success: true,
                    data: {
                        path: params.path,
                        content,
                        size: content.length
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // List Files
    {
        name: "list_files",
        description: "List all files in a directory",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Directory path (default: root)"
                }
            },
            required: []
        },
        handler: async (params, context) => {
            try {
                const files = await fsManager.listFiles(
                    context.projectId,
                    params.path || ""
                );

                return {
                    success: true,
                    data: {
                        path: params.path || "/",
                        files,
                        count: files.length
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // File Exists
    {
        name: "file_exists",
        description: "Check if a file exists",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "File path to check"
                }
            },
            required: ["path"]
        },
        handler: async (params, context) => {
            try {
                const exists = fsManager.fileExists(
                    context.projectId,
                    params.path
                );

                return {
                    success: true,
                    data: {
                        path: params.path,
                        exists
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Delete File
    {
        name: "delete_file",
        description: "Delete a file from workspace",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "File path to delete"
                }
            },
            required: ["path"]
        },
        handler: async (params, context) => {
            try {
                await fsManager.deleteFile(context.projectId, params.path);

                return {
                    success: true,
                    data: {
                        path: params.path,
                        deleted: true
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Write Multiple Files
    {
        name: "write_files",
        description: "Write multiple files at once",
        parameters: {
            type: "object",
            properties: {
                files: {
                    type: "array",
                    description: "Array of {path, content} objects",
                    items: {
                        type: "object",
                        properties: {
                            path: { type: "string" },
                            content: { type: "string" }
                        }
                    }
                }
            },
            required: ["files"]
        },
        handler: async (params, context) => {
            try {
                await fsManager.writeFiles(context.projectId, params.files);

                return {
                    success: true,
                    data: {
                        count: params.files.length,
                        files: params.files.map((f: any) => f.path)
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    }
];