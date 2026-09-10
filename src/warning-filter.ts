// Suppress Node runtime experimental warnings (e.g. SQLite experimental features)
const originalEmitWarning = process.emitWarning.bind(process);

(process as any).emitWarning = function emitWarning(
  warning: string | Error,
  ...args: any[]
): void {
  if (typeof warning === 'string') {
    if (warning.includes('SQLite') || warning.includes('experimental') || warning.includes('ExperimentalWarning')) {
      return;
    }
  } else if (warning && typeof warning === 'object') {
    if (warning.name === 'ExperimentalWarning' || (warning.message && (warning.message.includes('SQLite') || warning.message.includes('experimental')))) {
      return;
    }
  }
  if (typeof args[0] === 'string' && (args[0] === 'ExperimentalWarning' || args[0].includes('SQLite') || args[0].includes('experimental'))) {
    return;
  }
  if (typeof args[1] === 'string' && (args[1] === 'ExperimentalWarning' || args[1].includes('SQLite') || args[1].includes('experimental'))) {
    return;
  }
  return originalEmitWarning(warning as any, ...(args as [any]));
};

process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' || warning.message?.includes('SQLite')) {
    return;
  }
});

