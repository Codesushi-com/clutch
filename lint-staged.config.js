module.exports = {
  // Type-check all TypeScript files (not just staged ones, since types are interconnected)
  '**/*.(ts|tsx)': () => 'npm run type-check',
  
  // Lint staged files only
  '**/*.(ts|tsx|js|jsx)': (filenames) => `eslint --fix ${filenames.join(' ')}`,
};