export type IconName =
  | 'select'
  | 'orbit'
  | 'pan'
  | 'zoom'
  | 'measure'
  | 'wireframe'
  | 'isolate'
  | 'eye'
  | 'eyeOff'
  | 'import'
  | 'export'
  | 'grid'
  | 'axes'
  | 'perspective'
  | 'orthographic'
  | 'fit'
  | 'resetCamera'
  | 'search'
  | 'chevronRight'
  | 'chevronDown'
  | 'trash'
  | 'edit'
  | 'copy'
  | 'plus'
  | 'close'
  | 'check'
  | 'more'
  | 'material'
  | 'edges'
  | 'tree'
  | 'undo'
  | 'redo'
  | 'save'
  | 'folder'
  | 'warning'
  | 'mesh'
  | 'group'
  | 'face'

const paths: Record<IconName, string> = {
  select: 'M4 3l6.5 16 2-6.5L19 10.5z',
  orbit: 'M12 3a9 9 0 1 0 9 9M18 3v5h-5',
  pan: 'M12 2v20M2 12h20M6 6l-3 3 3 3M18 6l3 3-3 3M6 18l-3-3 3-3M18 18l3-3-3-3',
  zoom: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3M8 11h6',
  measure: 'M3 17l14-14M6 8l2-2M9 11l2-2M12 14l2-2M15 17l2-2M18 6l3-3',
  wireframe: 'M12 3l9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8',
  isolate: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-4 4.6M6.2 6.2C3.6 8 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.2 3.6-.6',
  import: 'M12 3v12m0 0l-4-4m4 4l4-4M4 21h16',
  export: 'M12 21V9m0 0l-4 4m4-4l4 4M4 3h16',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  axes: 'M4 20V4M4 20h16M4 20l6-6M4 4l4 4',
  perspective: 'M4 6h10v12H4zM14 8l6-3v14l-6-3',
  orthographic: 'M4 4h16v16H4z',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  resetCamera: 'M4 12a8 8 0 1 1 2.3 5.6M4 12v5h5M4 12v-5h5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM14 6l4 4',
  copy: 'M8 8V4h12v12h-4M4 8h12v12H4z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12l6 6 10-12',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  material: 'M12 2l9 5v10l-9 5-9-5V7z M12 2v20 M3 7l9 5 9-5',
  edges: 'M4 4h16v16H4zM4 4l16 16M20 4L4 20',
  tree: 'M5 3v18M5 7h5M5 13h5M5 19h5',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h1',
  save: 'M5 4h11l3 3v13H5zM8 4v6h8V4M8 14h8v6H8z',
  folder: 'M3 6h6l2 2h10v11H3z',
  warning: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  mesh: 'M4 4l8-2 8 2v8l-8 8-8-8z M4 4l8 6 8-6 M12 10v10',
  group: 'M4 4h7v7H4zM13 13h7v7h-7zM4 13h5v5H4zM15 4h5v5h-5z',
  face: 'M4 6l16-2v14L4 20z M4 6l16 12 M4 20l16-14',
}

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
