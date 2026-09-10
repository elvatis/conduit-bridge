// Suppress Node runtime experimental warnings (e.g. SQLite experimental features)
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning') {
    return;
  }
});
