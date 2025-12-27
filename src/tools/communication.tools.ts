// src/tools/communication.tools.ts
import { ToolDefinition } from "./types";
import { wsManager } from "../websocket/manager";

export const communicationTools: ToolDefinition[] = [
    // Send Message
    {
        name: "send_message",
        description: "Send a message to the user via WebSocket",
        parameters: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "Message to send to user"
                }
            },
            required: ["message"]
        },
        handler: async (params, context) => {
            try {
                wsManager.sendMessage(context.projectId, {
                    message: params.message
                });
                return {
                    success: true,
                    data: {
                        sent: true,
                        message: params.message
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

    // Send Filler (typing indicator)
    {
        name: "send_filler",
        description: "Show typing indicator with status message",
        parameters: {
            type: "object",
            properties: {
                filler: {
                    type: "string",
                    description: "Status message (e.g., 'analyzing code...', 'generating plan...')"
                }
            },
            required: ["filler"]
        },
        handler: async (params, context) => {
            try {
                wsManager.sendFiller(context.projectId, params.filler);
                return {
                    success: true,
                    data: {
                        sent: true,
                        filler: params.filler
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

    // Ask Questions
    {
        name: "ask_questions",
        description: "Ask clarification questions to the user",
        parameters: {
            type: "object",
            properties: {
                questions: {
                    type: "array",
                    description: "Array of question objects",
                    items: {
                        type: "object",
                        properties: {
                            id: {
                                type: "string",
                                description: "Unique question ID"
                            },
                            text: {
                                type: "string",
                                description: "Question text"
                            },
                            type: {
                                type: "string",
                                description: "Question type",
                                enum: ["text", "choice", "boolean"]
                            },
                            options: {
                                type: "array",
                                description: "Options for choice type questions",
                                items: { type: "string" }
                            }
                        }
                    }
                }
            },
            required: ["questions"]
        },
        handler: async (params, context) => {
            try {
                wsManager.askQuestion(context.projectId, {
                    questions: params.questions
                });

                return {
                    success: true,
                    data: {
                        sent: true,
                        questionCount: params.questions.length
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