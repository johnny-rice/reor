import { ToolResultPart } from 'ai'
import { z } from 'zod'
import { ToolDefinition } from './types'
import { retreiveFromVectorDB } from '@/utils/db'

export const searchToolDefinition: ToolDefinition = {
  name: 'search',
  description: "Semantically search the user's personal knowledge base",
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'The query to search for',
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 20,
      description: 'The number of results to return',
    },
  ],
  autoExecute: true,
}

export const createNoteToolDefinition: ToolDefinition = {
  name: 'createNote',
  description: "Create a new note in the user's personal knowledge base",
  parameters: [
    {
      name: 'filename',
      type: 'string',
      description: 'The filename of the note',
    },
    {
      name: 'content',
      type: 'string',
      description: 'The content of the note',
    },
  ],
}

export const createDirectoryToolDefinition: ToolDefinition = {
  name: 'createDirectory',
  description: "Create a new directory in the user's personal knowledge base",
  parameters: [
    {
      name: 'directoryName',
      type: 'string',
      description: 'The name of the directory to create',
    },
  ],
}

const readFileToolDefinition: ToolDefinition = {
  name: 'readFile',
  description: "Read a file from the user's personal knowledge base",
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: 'The path of the file to read',
    },
  ],
}

export const deleteNoteToolDefinition: ToolDefinition = {
  name: 'deleteNote',
  description: "Delete a note from the user's personal knowledge base",
  parameters: [
    {
      name: 'filename',
      type: 'string',
      description: 'The filename of the note to delete',
    },
  ],
}

export const editNoteToolDefinition: ToolDefinition = {
  name: 'editNote',
  description: "Edit a note in the user's personal knowledge base",
  parameters: [
    {
      name: 'filename',
      type: 'string',
      description: 'The filename of the note to edit',
    },
    {
      name: 'content',
      type: 'string',
      description: 'The content to edit the note to',
    },
  ],
}

export const appendToNoteToolDefinition: ToolDefinition = {
  name: 'appendToNote',
  description: "Append to a note in the user's personal knowledge base",
  parameters: [
    {
      name: 'filename',
      type: 'string',
      description: 'The filename of the note to append to',
    },
    {
      name: 'content',
      type: 'string',
      description: 'The content to append to the note',
    },
  ],
}

export const listFilesToolDefinition: ToolDefinition = {
  name: 'listFiles',
  description: "List all files in the user's personal knowledge base",
  parameters: [],
}

// here we could add like list files as well.

export const allAvailableToolDefinitions: ToolDefinition[] = [
  searchToolDefinition,
  createNoteToolDefinition,
  createDirectoryToolDefinition,
  readFileToolDefinition,
  deleteNoteToolDefinition,
  appendToNoteToolDefinition,
  editNoteToolDefinition,
  listFilesToolDefinition,
]

type ToolFunction = (...args: any[]) => Promise<any>

type ToolFunctionMap = {
  [key: string]: ToolFunction
}

export const toolNamesToFunctions: ToolFunctionMap = {
  search: async (query: string, limit: number): Promise<any[]> => {
    const results = await retreiveFromVectorDB(query, { limit, passFullNoteIntoContext: true })
    return results
  },
  createNote: async (filename: string, content: string): Promise<string> => {
    const vault = await window.electronStore.getVaultDirectoryForWindow()
    const path = await window.path.join(vault, filename)
    await window.fileSystem.createFile(path, content)
    return `Note ${path} created successfully`
  },
  createDirectory: async (directoryName: string): Promise<string> => {
    const vault = await window.electronStore.getVaultDirectoryForWindow()
    const path = await window.path.join(vault, directoryName)
    await window.fileSystem.createDirectory(path)
    return `Directory ${directoryName} created successfully`
  },
  readFile: async (filePath: string): Promise<string> => {
    const content = await window.fileSystem.readFile(filePath)
    return content
  },
  deleteNote: async (filename: string): Promise<string> => {
    const vault = await window.electronStore.getVaultDirectoryForWindow()
    const path = await window.path.join(vault, filename)
    await window.fileSystem.deleteFile(path)
    return `Note ${filename} deleted successfully`
  },
  editNote: async (filename: string, content: string): Promise<string> => {
    const vault = await window.electronStore.getVaultDirectoryForWindow()
    const path = await window.path.join(vault, filename)
    await window.fileSystem.writeFile({ filePath: path, content })
    return `Note ${filename} edited successfully`
  },
  appendToNote: async (filename: string, content: string): Promise<string> => {
    const vault = await window.electronStore.getVaultDirectoryForWindow()
    const path = await window.path.join(vault, filename)
    const currentContent = await window.fileSystem.readFile(path)
    await window.fileSystem.writeFile({ filePath: path, content: currentContent + content })
    return `Note ${filename} appended to successfully`
  },
  listFiles: async (): Promise<string[]> => {
    const files = await window.fileSystem.getFilesTreeForWindow()
    // convert to string
    return files.map((file) => file.name)
  },
}

type ToolName = keyof typeof toolNamesToFunctions

export async function executeTool(toolName: ToolName, args: unknown[]): Promise<any> {
  const tool = toolNamesToFunctions[toolName]
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  const out = await tool(...Object.values(args)) // TODO: make this cleaner quizas.
  return out
}

export async function createToolResult(toolName: string, args: unknown[], toolCallId: string): Promise<ToolResultPart> {
  try {
    const result = await executeTool(toolName, args)
    return {
      type: 'tool-result',
      toolCallId,
      toolName,
      result,
    }
  } catch (error) {
    return {
      type: 'tool-result',
      toolCallId,
      toolName,
      result: error,
      isError: true,
    }
  }
}

export function convertToolConfigToZodSchema(tool: ToolDefinition) {
  const parameterSchema = z.object(
    tool.parameters.reduce((acc, param) => {
      let zodType: z.ZodType<any>

      switch (param.type) {
        case 'string':
          zodType = z.string()
          break
        case 'number':
          zodType = z.number()
          break
        case 'boolean':
          zodType = z.boolean()
          break
        default:
          throw new Error(`Unsupported parameter type: ${param.type}`)
      }

      // Apply default value if it exists
      if (param.defaultValue !== undefined) {
        zodType = zodType.default(param.defaultValue)
      }

      // Apply description
      zodType = zodType.describe(param.description)

      return { ...acc, [param.name]: zodType }
    }, {}),
  )

  return {
    [tool.name]: {
      description: tool.description,
      parameters: parameterSchema,
    },
  }
}