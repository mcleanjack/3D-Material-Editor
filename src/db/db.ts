import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CustomMaterial } from '../types/material'
import type { AuthoringProject } from '../types/project'

interface EditorDBSchema extends DBSchema {
  materials: {
    key: string
    value: CustomMaterial
    indexes: { 'by-category': string; 'by-updatedAt': number }
  }
  assets: {
    key: string
    value: { id: string; blob: Blob }
  }
  projects: {
    key: string
    value: AuthoringProject
    indexes: { 'by-updatedAt': number }
  }
}

const DB_NAME = 'material-editor'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<EditorDBSchema>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<EditorDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const materials = db.createObjectStore('materials', { keyPath: 'id' })
        materials.createIndex('by-category', 'category')
        materials.createIndex('by-updatedAt', 'updatedAt')

        db.createObjectStore('assets', { keyPath: 'id' })

        const projects = db.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('by-updatedAt', 'updatedAt')
      },
    })
  }
  return dbPromise
}

// ---- Materials -------------------------------------------------------

export async function dbGetAllMaterials(): Promise<CustomMaterial[]> {
  const db = await getDb()
  return db.getAll('materials')
}

export async function dbPutMaterial(material: CustomMaterial): Promise<void> {
  const db = await getDb()
  await db.put('materials', material)
}

export async function dbDeleteMaterial(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('materials', id)
}

// ---- Texture asset blobs ----------------------------------------------

export async function dbPutAsset(id: string, blob: Blob): Promise<void> {
  const db = await getDb()
  await db.put('assets', { id, blob })
}

export async function dbGetAsset(id: string): Promise<Blob | undefined> {
  const db = await getDb()
  const row = await db.get('assets', id)
  return row?.blob
}

export async function dbDeleteAsset(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('assets', id)
}

// ---- Projects -----------------------------------------------------------

export async function dbGetAllProjects(): Promise<AuthoringProject[]> {
  const db = await getDb()
  return db.getAll('projects')
}

export async function dbPutProject(project: AuthoringProject): Promise<void> {
  const db = await getDb()
  await db.put('projects', project)
}

export async function dbDeleteProject(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('projects', id)
}
