import path from 'node:path'

const resolveFenceLanguage = (filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase()
  switch (extension) {
    case '.js':
      return 'js'
    case '.jsx':
      return 'jsx'
    case '.ts':
      return 'ts'
    case '.tsx':
      return 'tsx'
    default:
      return 'text'
  }
}

export const buildPrompt = (
  promptTemplate: string,
  filePath: string,
  fileContent: string,
): string =>
  [
    promptTemplate.trim(),
    '',
    '## Target File',
    filePath,
    '',
    '## File Contents',
    `\`\`\`${resolveFenceLanguage(filePath)}`,
    fileContent,
    '```',
  ].join('\n')
