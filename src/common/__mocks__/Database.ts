// src/mcp/__mocks__/Database.ts
import { ITask } from '../../common/Task';

export interface ITaskDatabase {
  tasks: ITask[];
  nextId: number;
}

export const defaultDatabase: ITaskDatabase = {
  tasks: [],
  nextId: 1,
};

export type TaskDb = {
  data: ITaskDatabase;
  read: () => Promise<void>;
  write: () => Promise<void>;
};

export async function createDatabase(): Promise<TaskDb> {
  // Create an in-memory mock implementation
  const memoryDb: TaskDb = {
    data: { ...defaultDatabase },
    read: jest.fn().mockResolvedValue(undefined),
    write: jest.fn().mockResolvedValue(undefined),
  };

  return memoryDb;
}
