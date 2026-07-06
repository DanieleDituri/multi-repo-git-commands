export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateBranchName(name: string): ValidationResult {
  if (!name || name.length === 0) {
    return { valid: false, error: "Branch name cannot be empty" };
  }
  if (name.length > 200) {
    return { valid: false, error: "Branch name too long (max 200 characters)" };
  }
  if (name.startsWith('-')) {
    return { valid: false, error: "Branch name cannot start with -" };
  }
  if (!/^[a-zA-Z0-9._\-/]+$/.test(name)) {
    return { valid: false, error: "Invalid characters in branch name (only alphanumeric, dots, hyphens, slashes allowed)" };
  }
  return { valid: true };
}

export function validateCommitMessage(msg: string): ValidationResult {
  if (!msg || msg.length === 0) {
    return { valid: false, error: "Commit message cannot be empty" };
  }
  if (msg.length > 1000) {
    return { valid: false, error: "Commit message too long (max 1000 characters)" };
  }
  return { valid: true };
}

export function validateTagName(name: string): ValidationResult {
  if (!name || name.length === 0) {
    return { valid: false, error: "Tag name cannot be empty" };
  }
  if (name.length > 200) {
    return { valid: false, error: "Tag name too long (max 200 characters)" };
  }
  if (!/^[a-zA-Z0-9._\-]+$/.test(name)) {
    return { valid: false, error: "Invalid characters in tag name (only alphanumeric, dots, hyphens allowed)" };
  }
  return { valid: true };
}

export function validateRemoteName(name: string): ValidationResult {
  if (!name || name.length === 0) {
    return { valid: false, error: "Remote name cannot be empty" };
  }
  if (name.length > 100) {
    return { valid: false, error: "Remote name too long (max 100 characters)" };
  }
  if (!/^[a-zA-Z0-9._\-]+$/.test(name)) {
    return { valid: false, error: "Invalid characters in remote name" };
  }
  return { valid: true };
}

export function validateRemoteURL(url: string): ValidationResult {
  if (!url || url.length === 0) {
    return { valid: false, error: "Remote URL cannot be empty" };
  }
  if (url.length > 500) {
    return { valid: false, error: "Remote URL too long" };
  }

  const isHTTP = url.startsWith('http://') || url.startsWith('https://');
  const isSSH = url.includes('@') && url.includes(':') && !url.includes('://');
  const isLocalPath = url.startsWith('/');

  if (!isHTTP && !isSSH && !isLocalPath) {
    return { valid: false, error: "Invalid URL format. Use http://, https://, SSH (user@host:path), or local path" };
  }

  if (isHTTP) {
    try {
      new URL(url);
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid HTTP/HTTPS URL" };
    }
  }

  return { valid: true };
}

export function validateStashMessage(msg?: string): ValidationResult {
  if (!msg) {
    return { valid: true }; // Optional
  }
  if (msg.length > 500) {
    return { valid: false, error: "Stash message too long (max 500 characters)" };
  }
  return { valid: true };
}

export function validateCustomGitArgs(args: string[]): ValidationResult {
  if (!args || args.length === 0) {
    return { valid: false, error: "Git arguments cannot be empty" };
  }
  if (args.length > 20) {
    return { valid: false, error: "Too many git arguments (max 20)" };
  }

  // Check for dangerous commands
  const dangerous = ['rm', 'reset', 'clean', 'gc', 'rebase', 'push', '--force'];
  const hasWarning = dangerous.some(cmd => args.some(arg => arg.includes(cmd)));

  if (hasWarning) {
    return { valid: true }; // Allow but warn will be shown separately
  }

  return { valid: true };
}
