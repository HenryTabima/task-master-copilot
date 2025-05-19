// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TaskProvider } from './mcp/TaskProvider';
import { TaskTreeDataProvider, TaskItem } from './vscode/TaskTreeDataProvider'; // Import TaskTreeDataProvider and TaskItem
import { TaskTool } from './copilot/TaskTool';
import { createDatabase, TaskDb } from './common/Database';
import { TextDecoder, TextEncoder } from 'util'; // Standard Node.js module
import * as path from 'path'; // Import path module
import * as os from 'os'; // Import os module

const INSTRUCTION_FILE_NAME = 'copilot-task-master-workflow.instructions.md';
const EXPECTED_INSTRUCTION_KEYWORDS = ['TaskTool', 'Copilot Task Master workflow']; // Keywords to check for

/**
 * Attempts to get the user-level Copilot instructions directory URI.
 * This is an approximation as there isn't a direct VS Code API for this specific path.
 */
function getUserCopilotInstructionsDirUri(context: vscode.ExtensionContext): vscode.Uri | undefined {
  // globalStorageUri is typically: /Users/username/Library/Application Support/Code/User/globalStorage/publisher.extensionName
  // We want to navigate to: /Users/username/Library/Application Support/Code/User/prompts

  // On macOS, the path is usually ~/Library/Application Support/Code/User or Code - Insiders/User
  // On Windows, %APPDATA%\Code\User or %APPDATA%\Code - Insiders\User
  // On Linux, ~/.config/Code/User or ~/.config/Code - Insiders/User

  // A more direct approach for macOS, assuming standard VS Code or Insiders name
  // This is still a heuristic and might not cover all edge cases (e.g., custom portable mode paths)
  const homeDir = os.homedir(); // Use os.homedir()
  if (!homeDir) {
    vscode.window.showWarningMessage('Could not determine home directory. Skipping instruction file check.');
    return undefined;
  }

  const appSupportPath = path.join(homeDir, 'Library', 'Application Support');
  let userCodePath: string | undefined;

  // Check for Insiders version first, then stable
  const insidersPath = path.join(appSupportPath, 'Code - Insiders', 'User');
  const stablePath = path.join(appSupportPath, 'Code', 'User');

  // This is a simplified check. A real implementation might need to be more robust
  // or rely on VS Code to provide a more direct way to get this path.
  // For now, we'll try to see if one of these paths exists.
  // However, directly checking fs.stat here from extension.ts might be problematic
  // without async/await and proper error handling for path checking.
  // Let's assume the path based on the application name if possible, otherwise fallback.

  if (vscode.env.appName.includes('Insiders')) {
    userCodePath = insidersPath;
  } else if (vscode.env.appName.includes('Code')) {
    userCodePath = stablePath;
  } else {
    // Fallback if appName is not as expected, try globalStorageUri parent
    // globalStorageUri path is like: file:///Users/user/Library/Application%20Support/Code%20-%20Insiders/User/globalStorage/publisher.extension
    const globalStorageParent = vscode.Uri.joinPath(context.globalStorageUri, '../..'); // up to .../User/
    return vscode.Uri.joinPath(globalStorageParent, 'prompts');
  }

  if (userCodePath) {
    return vscode.Uri.joinPath(vscode.Uri.file(userCodePath), 'prompts');
  }

  vscode.window.showWarningMessage('Could not reliably determine VS Code User directory for Copilot instructions.');
  return undefined;
}

/**
 * Checks for the presence and basic content of the user-level instruction file.
 * Prompts the user to create or update it if necessary.
 */
async function checkAndPromptForInstructionFile(context: vscode.ExtensionContext): Promise<void> {
  const instructionFileDirUri = getUserCopilotInstructionsDirUri(context);

  if (!instructionFileDirUri) {
    return;
  }

  const instructionFileUri = vscode.Uri.joinPath(instructionFileDirUri, INSTRUCTION_FILE_NAME);
  const predefinedContent = `---
applyTo: '**'
---
## Planning Process

- Begin each ticket or feature with a planning session.
- Use the **TaskTool** to generate a detailed list of tasks to guide implementation.
- Each task should be small enough to be completed in a single commit, specific, concrete, and verifiable.
- Tasks are managed via the **TaskTool**, allowing for subtasks and a clear order of execution.
- Update the task list using the **TaskTool** as work progresses.

## Workflow

- IMPORTANT: Ensure tasks are defined using the **TaskTool** before writing code.
- Implement one task at a time, in the order managed by the **TaskTool** (e.g., by creation order or an explicitly set priority if supported by the tool).
- Execute commands required for task steps (e.g., for testing, linting, or verification subtasks) directly without seeking additional user confirmation.
- Each main task managed by the **TaskTool** must conclude with a verification step.
  - This verification can be part of the task's description or a separate sub-task created using the **TaskTool**.
  - Define how to verify the completion and correctness of the main task.
  - Prefer automated verification using unit tests or integration tests.
  - If automated verification is not feasible, describe the steps for manual verification.
- Use the **TaskTool** to mark tasks as complete immediately after the corresponding code changes are made and verified.
- If the overall plan (the tasks themselves or their order) needs to change, update the tasks using the **TaskTool** first.
- All file creations or edits must directly correspond to completing a task managed by the **TaskTool**.
- Test each completed task when possible.
- After successfully editing a file as part of a task:
  - Do not display the file's content in the chat.
- After a task is completed (which includes all its subtasks, code changes, and the task being marked as complete via the **TaskTool**):
  - Provide a brief summary of the _next_ task (e.g., the next incomplete task from the **TaskTool**).
  - STOP
  - If the next task involves code modifications, ask for user confirmation to proceed. For other types of tasks, you may state your intention and proceed.
- Document all components and functionality developed.

## Using the TaskTool

When you need to manage tasks, please use the \`TaskTool\`. Here are some general ways you might interact with it:

- To create a new task: "TaskTool, create a task to implement user authentication."
- To list tasks: "TaskTool, show me all incomplete tasks."
- To mark a task complete: "TaskTool, mark task 'implement user authentication' as complete."
- To add a subtask: "TaskTool, add a subtask 'write unit tests' to task 'implement user authentication'."

Refer to the capabilities of the \`TaskTool\` for more specific commands and actions.
`;

  const updateButton = 'Update with Template';
  const createButton = 'Create with Template';
  const laterButton = 'Later';
  try {
    await vscode.workspace.fs.stat(instructionFileUri);
    const contentBytes = await vscode.workspace.fs.readFile(instructionFileUri);
    const content = new TextDecoder().decode(contentBytes);

    const hasAllKeywords = EXPECTED_INSTRUCTION_KEYWORDS.every((keyword) => content.includes(keyword));

    if (!hasAllKeywords) {
      const selection = await vscode.window.showWarningMessage(
        `The instruction file '${INSTRUCTION_FILE_NAME}' was found at '${instructionFileUri.fsPath}' but might not be correctly configured for the Copilot Task Master workflow (missing keywords: ${EXPECTED_INSTRUCTION_KEYWORDS.join(', ')}).`,
        { modal: true },
        updateButton,
        laterButton,
      );
      if (selection === updateButton) {
        await vscode.workspace.fs.writeFile(instructionFileUri, new TextEncoder().encode(predefinedContent));
        vscode.window.showInformationMessage(
          `Instruction file '${INSTRUCTION_FILE_NAME}' updated at '${instructionFileUri.fsPath}'.`,
        );
      }
    } else {
      // Optional: Notify only in development mode if needed, or remove for less noise
      // if (context.extensionMode === vscode.ExtensionMode.Development) {
      //  vscode.window.showInformationMessage(`Instruction file '${INSTRUCTION_FILE_NAME}' found and seems correctly configured.`);
      // }
    }
  } catch (error: unknown) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      const selection = await vscode.window.showInformationMessage(
        `To optimize your workflow with Copilot Task Master, consider creating an instruction file ('${INSTRUCTION_FILE_NAME}') in your user profile's Copilot instructions directory: ${instructionFileDirUri.fsPath}.`,
        { modal: true },
        createButton,
        laterButton,
      );
      if (selection === createButton) {
        try {
          await vscode.workspace.fs.createDirectory(instructionFileDirUri); // Ensure directory exists
        } catch (dirError: unknown) {
          if (!(dirError instanceof vscode.FileSystemError && dirError.code === 'FileExists')) {
            const message = dirError instanceof Error ? dirError.message : String(dirError);
            vscode.window.showErrorMessage(`Failed to create directory for instruction file: ${message}`);
            return;
          }
        }
        await vscode.workspace.fs.writeFile(instructionFileUri, new TextEncoder().encode(predefinedContent));
        vscode.window.showInformationMessage(
          `Instruction file '${INSTRUCTION_FILE_NAME}' created at '${instructionFileUri.fsPath}'.`,
        );
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Error accessing instruction file '${instructionFileUri.fsPath}': ${message}`);
    }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  await checkAndPromptForInstructionFile(context); // Ensure this is called on activation
  // if (context.extensionMode === vscode.ExtensionMode.Development) {
  // 	vscode.window.showInformationMessage('Copilot Task Master is now active!');
  // }

  const taskProvider = new TaskProvider();

  const taskDbInstance: TaskDb = await createDatabase(context);
  try {
    await taskDbInstance.read();
    // if (context.extensionMode === vscode.ExtensionMode.Development) {
    // 	vscode.window.showInformationMessage('Task database loaded successfully for Tool and Provider.');
    // }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to load task database: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  await taskProvider.setDb(taskDbInstance);

  const taskTreeDataProvider = new TaskTreeDataProvider(taskProvider, taskDbInstance);
  context.subscriptions.push(taskTreeDataProvider);
  vscode.window.registerTreeDataProvider('copilot-task-master.tasksView', taskTreeDataProvider);

  // Command to refresh the tree view (optional, but good for updates)
  const refreshTreeViewCommand = vscode.commands.registerCommand('copilot-task-master.refreshTasksView', () => {
    taskTreeDataProvider.refresh();
  });
  context.subscriptions.push(refreshTreeViewCommand);

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand('copilot-task-master.helloWorld', () => {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    vscode.window.showInformationMessage('Hello World from copilot-task-master!');
  });

  context.subscriptions.push(disposable);

  const taskTool = new TaskTool(taskProvider);
  context.subscriptions.push(vscode.lm.registerTool(taskTool.name, taskTool));

  // if (context.extensionMode === vscode.ExtensionMode.Development) {
  //   vscode.window.showInformationMessage('Task Manager Copilot tool registered.');
  // }

  // Register the showTasks command (though the primary UI is now the TreeView)
  // This command could be used for other purposes or as an alternative way to list tasks if needed.
  const showTasksDisposable = vscode.commands.registerCommand('copilot-task-master.showTasks', async () => {
    const tasks = await taskProvider.getTasks(); // Fetch all tasks - Corrected: removed {}
    if (tasks.length === 0) {
      vscode.window.showInformationMessage('No tasks found.');
      return;
    }
    const taskItems = tasks.map((task) => ({
      label: task.title,
      description: task.description,
      detail: `Completed: ${task.completed}, Created: ${new Date(task.createdAt).toLocaleString()}`,
      id: task.id,
    }));
    const selectedTask = await vscode.window.showQuickPick(taskItems, {
      placeHolder: 'Select a task to view details (this is a sample action)',
    });
    if (selectedTask) {
      vscode.window.showInformationMessage(`You selected: ${selectedTask.label}`);
      // Here you could open the task for editing, mark as complete, etc.
    }
  });
  context.subscriptions.push(showTasksDisposable);

  // --- Register Task Interaction Commands ---

  const markTaskAsCompleteCommand = vscode.commands.registerCommand(
    'copilot-task-master.markTaskAsComplete',
    async (taskItem: TaskItem) => {
      if (taskItem && taskItem.task) {
        try {
          await taskProvider.updateTask(taskItem.task.id, { completed: true });
          taskTreeDataProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to mark task as complete: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        vscode.window.showWarningMessage('No task selected to mark as complete.');
      }
    },
  );
  context.subscriptions.push(markTaskAsCompleteCommand);

  const markTaskAsIncompleteCommand = vscode.commands.registerCommand(
    'copilot-task-master.markTaskAsIncomplete',
    async (taskItem: TaskItem) => {
      if (taskItem && taskItem.task) {
        try {
          await taskProvider.updateTask(taskItem.task.id, { completed: false });
          taskTreeDataProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to mark task as incomplete: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        vscode.window.showWarningMessage('No task selected to mark as incomplete.');
      }
    },
  );
  context.subscriptions.push(markTaskAsIncompleteCommand);

  const deleteTaskCommand = vscode.commands.registerCommand(
    'copilot-task-master.deleteTask',
    async (taskItem: TaskItem) => {
      if (taskItem && taskItem.task) {
        try {
          const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete task "${taskItem.task.title}"?`,
            { modal: true },
            'Delete',
          );
          if (confirm === 'Delete') {
            await taskProvider.deleteTask(taskItem.task.id);
            taskTreeDataProvider.refresh();
            vscode.window.showInformationMessage(`Task "${taskItem.task.title}" deleted.`);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        vscode.window.showWarningMessage('No task selected to delete.');
      }
    },
  );
  context.subscriptions.push(deleteTaskCommand);

  const editTaskTitleCommand = vscode.commands.registerCommand(
    'copilot-task-master.editTaskTitle',
    async (taskItem: TaskItem) => {
      if (!taskItem || !taskItem.task) {
        vscode.window.showWarningMessage('No task selected to edit.');
        return;
      }
      const newTitle = await vscode.window.showInputBox({
        prompt: 'Enter the new task title',
        value: taskItem.task.title,
        validateInput: (value) => {
          return value.trim() === '' ? 'Title cannot be empty' : null;
        },
      });
      if (newTitle && newTitle.trim() !== '' && newTitle !== taskItem.task.title) {
        try {
          await taskProvider.updateTask(taskItem.task.id, { title: newTitle.trim() });
          taskTreeDataProvider.refresh();
          vscode.window.showInformationMessage(`Task title updated to "${newTitle.trim()}".`);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to update task title: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    },
  );
  context.subscriptions.push(editTaskTitleCommand);

  const editTaskDescriptionCommand = vscode.commands.registerCommand(
    'copilot-task-master.editTaskDescription',
    async (taskItem: TaskItem) => {
      if (!taskItem || !taskItem.task) {
        vscode.window.showWarningMessage('No task selected to edit.');
        return;
      }
      const newDescription = await vscode.window.showInputBox({
        prompt: 'Enter the new task description',
        value: taskItem.task.description || '',
      });

      // Allow empty description, update if it has changed
      if (newDescription !== undefined && newDescription !== taskItem.task.description) {
        try {
          await taskProvider.updateTask(taskItem.task.id, { description: newDescription });
          taskTreeDataProvider.refresh();
          vscode.window.showInformationMessage('Task description updated.');
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to update task description: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    },
  );
  context.subscriptions.push(editTaskDescriptionCommand);

  const createTaskCommand = vscode.commands.registerCommand('copilot-task-master.createTask', async () => {
    const title = await vscode.window.showInputBox({
      prompt: 'Enter the title for the new task',
      validateInput: (value) => {
        return value.trim() === '' ? 'Title cannot be empty' : null;
      },
    });

    if (title && title.trim() !== '') {
      try {
        // Ensure the argument matches ITaskCreateOptions if defined, or { title: string, description?: string }
        await taskProvider.createTask({ title: title.trim() });
        taskTreeDataProvider.refresh();
        vscode.window.showInformationMessage(`Task "${title.trim()}" created.`);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  });
  context.subscriptions.push(createTaskCommand);

  const createSubTaskCommand = vscode.commands.registerCommand(
    'fulcrum.createSubTask',
    async (parentTaskItem: TaskItem) => {
      if (!parentTaskItem || !parentTaskItem.task) {
        vscode.window.showWarningMessage('Cannot create sub-task: No parent task selected or parent task is invalid.');
        return;
      }

      const title = await vscode.window.showInputBox({
        prompt: `Enter the title for the new sub-task under "${parentTaskItem.task.title}"`,
        validateInput: (value) => {
          return value.trim() === '' ? 'Title cannot be empty' : null;
        },
      });

      if (title && title.trim() !== '') {
        try {
          await taskProvider.createTask({
            title: title.trim(),
            parentId: parentTaskItem.task.id,
          });
          taskTreeDataProvider.refresh();
          vscode.window.showInformationMessage(
            `Sub-task "${title.trim()}" created under "${parentTaskItem.task.title}".`,
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create sub-task: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    },
  );
  context.subscriptions.push(createSubTaskCommand);

  const deleteCompletedTasksFromUICommand = vscode.commands.registerCommand(
    'copilot-task-master.deleteCompletedTasksFromUI',
    async () => {
      try {
        await taskTreeDataProvider.deleteCompletedTasks();
        // The TaskTreeDataProvider.deleteCompletedTasks method already shows a message and refreshes.
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to delete completed tasks from UI: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
  context.subscriptions.push(deleteCompletedTasksFromUICommand);

  // Check for instruction file setup
  await checkAndPromptForInstructionFile(context);

  // If TaskProvider had a dispose method, it should also be added to subscriptions
  // if (typeof taskProvider.dispose === 'function') {
  //   context.subscriptions.push(taskProvider);
  // }
}

// This method is called when your extension is deactivated
export function deactivate() {}
