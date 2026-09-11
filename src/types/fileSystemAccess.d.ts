/** Minimal ambient types for the File System Access API's window-level entry points. TypeScript's
 * bundled DOM lib already declares FileSystemFileHandle/FileSystemWritableFileStream themselves,
 * but not these two methods yet — declared here as optional so callers feature-detect them
 * (`if (window.showSaveFilePicker) ...`) rather than assume support (Firefox/Safari lack both). */
interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string[]>
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: FilePickerAcceptType[]
}

interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[]
  multiple?: boolean
}

interface Window {
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
}
