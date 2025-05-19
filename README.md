# Copilot Task Master

Copilot Task Master is a VS Code extension that helps you manage your tasks seamlessly within the editor, with the added power of Copilot integration.

## Features

- **Task Management:** Create, view, update, and delete tasks.
- **Tree View:** See your tasks organized in a dedicated view in the VS Code sidebar.
- **Copilot Integration:** Manage tasks using natural language through Copilot Chat.
- **Sub-tasks:** Organize tasks hierarchically with sub-tasks.
- **Persistent Storage:** Tasks are saved locally and persist across VS Code sessions.

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd copilot-task-master
    ```
2.  **Install dependencies:**
    This project uses pnpm as the package manager.
    ```bash
    pnpm install
    ```
3.  **Open in VS Code:**
    Open the `copilot-task-master` folder in Visual Studio Code.
4.  **Run the extension:**
    - Press `F5` to open a new Extension Development Host window with the extension running.
    - Alternatively, you can run the "watch" script to compile in watch mode:
      ```bash
      pnpm run watch
      ```
      And then launch the extension from the "Run and Debug" view in VS Code (usually by selecting "Run Extension").

## Usage

### Task View

- Access the "Copilot Task Master" view in the VS Code Explorer sidebar.
- **Add Task:** Click the "+" icon in the view's title bar.
- **Mark as Complete/Incomplete:** Click the checkbox next to a task.
- **Edit Title/Description:** Right-click on a task and select the appropriate edit option.
- **Delete Task:** Right-click on a task and select "Delete Task".
- **Create Sub-task:** Right-click on a parent task and select "Create Sub-task".

### Copilot Chat

You can interact with your tasks using Copilot Chat. Ensure the "Task Manager" tool (`task_manager_tool`) is available and enabled in your Copilot Chat session.

**Basic Operations:**

*   **List all tasks:**
    ```
    @task_manager_tool list
    ```
    *(This will output a list of your tasks with their IDs, titles, completion status, and order.)*

*   **Add a new task:**
    ```
    @task_manager_tool add taskTitle="My new important task"
    ```
    ```
    @task_manager_tool add taskTitle="Refactor the main module" taskDescription="Rewrite the core logic for better performance"
    ```

*   **Add a new subtask:**
    *(You'll need the `parentId` from the list tasks output.)*
    ```
    @task_manager_tool add taskTitle="Develop feature X" parentId="ID_OF_THE_PARENT_TASK"
    ```

*   **Toggle task completion status:**
    *(Toggles between complete and incomplete if `taskStatus` is not provided. You'll need the `taskId`.)*
    ```
    @task_manager_tool toggleComplete taskId="ID_OF_THE_TASK"
    ```
    *To explicitly set completion status:*
    ```
    @task_manager_tool toggleComplete taskId="ID_OF_THE_TASK" taskStatus=true  // Marks as complete
    ```
    ```
    @task_manager_tool toggleComplete taskId="ID_OF_THE_TASK" taskStatus=false // Marks as incomplete
    ```

*   **Delete all completed tasks:**
    ```
    @task_manager_tool deleteCompleted
    ```

**Batch Operations:**

The `batch` operation allows you to perform multiple actions in a single call. This is useful for more complex modifications, including deleting specific tasks.

*   **Delete a specific task:**
    *(You'll need the `taskId`.)*
    ```
    @task_manager_tool batch batchPayload={"operations":[{"action":"delete","taskId":"ID_OF_THE_TASK_TO_DELETE"}]}
    ```

*   **Perform multiple operations at once:**
    *(Example: Add a new task, complete an existing task, and delete another specific task.)*
    ```
    @task_manager_tool batch batchPayload={"operations":[
      {"action":"add","taskTitle":"New batch task","taskDescription":"This was added in a batch"},
      {"action":"toggleComplete","taskId":"ID_OF_EXISTING_TASK_1","taskStatus":true},
      {"action":"delete","taskId":"ID_OF_EXISTING_TASK_2"}
    ]}
    ```
    *(Remember to replace `"ID_OF_..."` with actual task IDs from your list.)*

**Note:** When providing string values like `taskTitle`, `taskDescription`, `taskId`, or `parentId` directly in the Copilot chat, ensure they are properly quoted if they contain spaces or special characters, following the requirements of the chat interface. The `batchPayload` is a JSON string.

## Development

- **Build:** `pnpm run compile`
- **Watch:** `pnpm run watch`
- **Lint:** `pnpm run lint`
- **Test:** `pnpm run test`

## Contributing

Contributions are welcome! Please follow the existing code style and submit a pull request.

## License

This project is licensed under the MIT License. (A `LICENSE` file should be created if this project is intended for public distribution).
