import fs from 'node:fs'
import path from 'node:path'

const lockRetryMs = 50
const lockTimeoutMs = 30000

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' && error !== null && 'code' in error

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const acquireFileLock = async (lockPath: string): Promise<number> => {
  const lockDir = path.dirname(lockPath)
  fs.mkdirSync(lockDir, { recursive: true })
  const start = Date.now()

  for (;;) {
    try {
      return fs.openSync(lockPath, 'wx')
    } catch (error) {
      if (isErrnoException(error) && error.code === 'EEXIST') {
        if (Date.now() - start > lockTimeoutMs) {
          throw new Error(`Timed out waiting for lock: ${lockPath}`)
        }
        await delay(lockRetryMs)
        continue
      }
      throw error
    }
  }
}

const releaseFileLock = (lockHandle: number, lockPath: string) => {
  try {
    fs.closeSync(lockHandle)
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(lockPath)
  } catch {
    // ignore
  }
}

export const withFileLock = async <T>(
  lockPath: string,
  action: () => Promise<T> | T,
): Promise<T> => {
  const lockHandle = await acquireFileLock(lockPath)
  try {
    return await action()
  } finally {
    releaseFileLock(lockHandle, lockPath)
  }
}
