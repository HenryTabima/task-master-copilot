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

You can interact with your tasks using Copilot Chat. Make sure the "Task Manager" tool is enabled for Copilot.

Examples:

- `@manageTasks list tasks`
- `@manageTasks add task "My new important task"`
- `@manageTasks add task "Refactor the main module" with description "Rewrite the core logic for better performance"`
- `@manageTasks complete task "ID_OF_THE_TASK"` (You can find the ID by listing tasks)

## Development

- **Build:** `pnpm run compile`
- **Watch:** `pnpm run watch`
- **Lint:** `pnpm run lint`
- **Test:** `pnpm run test`

## Contributing

Contributions are welcome! Please follow the existing code style and submit a pull request.

## License

This project is licensed under the MIT License. (A `LICENSE` file should be created if this project is intended for public distribution).
