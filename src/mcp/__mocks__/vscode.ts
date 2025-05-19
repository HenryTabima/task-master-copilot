export const ExtensionMode = {
  Development: 1,
  Production: 2,
  Test: 3,
};

export class Uri {
  static joinPath(...paths: any[]): any {
    return {
      fsPath: paths.join('/'), // Simplified for testing
    };
  }
}

export const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
};

export default {
  Uri,
  ExtensionMode,
  window,
};
