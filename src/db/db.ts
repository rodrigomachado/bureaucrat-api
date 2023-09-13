import * as sql3 from './sqlite3.promises'
import { populateDB } from '../exampleDataDomain'
import { log } from 'console'
import { toCapitalizedSpaced } from '../jsext/strings'

export type EntityMeta = {
  id: number,
  name: string,
  code: string,
  titleFormat: { title: string, subtitle: string },
  fields: {
    [name: string]: FieldMeta,
  },
}

export type FieldMeta = {
  id: number,
  name: string,
  code: string,
  placeholder: string,
  type: FieldType,
  identifier: boolean,
  hidden: boolean,
}

export enum FieldType {
  STRING = 'string',
  NUMBER = 'number',
  DATE = 'date',
  DATETIME = 'datetime',
  TIME = 'time',
}

/**
 * Data Domain inspector and cache.
 * 
 * The Data Domain is able to inspect a given SQL database looking for entities to be managed by Bureaucrat.
 * To avoid unnecessary reruns of the costly inspection and allow for user overrides, the Data Domain model is
 * persisted to a separate database upon first inspection.
 */
export class Database {
  // TODO WIP Rename Database to DataDomain and move it to an appropriate package

  private _metaDB?: Promise<sql3.Database>
  private _domainDB?: Promise<sql3.Database>

  async entityTypes(): Promise<EntityMeta[]> {
    // TODO WIP Cache entity types with a reasonable expiration
    const entityTypes = await this.mappedEntityTypes()
    const unmappedTables = await this.unmappedTables(entityTypes)
    if (!unmappedTables.length) return entityTypes // No tables left to inspect

    // TODO WIP Extract introspection to another function
    // Inspect missing tables
    const domainDB = await this.domainDB()
    // TODO WIP Parallelize processing of unmapped tables
    for (const table of unmappedTables) {
      const et: EntityMeta = {
        name: toCapitalizedSpaced(table),
        code: table,
        fields: {}
      } as any

      const fields = await domainDB.all('SELECT * FROM PRAGMA_TABLE_INFO(?)', [table])
      // TODO Validate `fields` shape?
      for (const f of fields as any[]) {
        log('processing field', f)
        const ft: FieldMeta = {
          name: toCapitalizedSpaced(f.name),
          code: f.name,
          placeholder: '', // TODO WIP Infer placeholder 
          type: sqliteTypeToFieldType(f.type),
          identifier: f.pk === 1,
          hidden: f.pk === 1,
        } as any

        et.fields[ft.code] = ft as any
      }

      // TODO WIP Better title format inference?
      const formatFirstNFields = (numberOfFields: number) =>
        Object.values(et.fields!)
          .filter(x => !x.hidden)
          .slice(0, numberOfFields)
          .map(x => `#{${x.code}}`).join(' ')
      et.titleFormat = {
        title: formatFirstNFields(2),
        subtitle: formatFirstNFields(3),
      }

      // TODO WIP Persist all infered metas and remove random ID attribution
      const randId = () => Math.floor(Math.random() * 100000)
      et.id = randId()
      Object.values(et.fields).forEach(ft => ft.id = randId())

      entityTypes.push(et)
    }

    return entityTypes
  }

  /**
   * Reads all entries for a particular entity type.
   */
  async read(entityTypeCode: string): Promise<any[]> {
    const entityTypes = await this.entityTypes()
    const [entityType] = entityTypes.filter(et => et.code === entityTypeCode)
    if (!entityType) throw new Error(`No entity type found for code '${entityTypeCode}'`)
    const db = await this.domainDB()
    // TODO Validate schema of returned data?
    // TODO Use specific projection to fetch entities?
    // TODO WIP Hide table name from UI? (dedicated EntityType#table field?)
    return await db.all(`SELECT * FROM ${entityType.code}`)
  }

  /**
   * Lazy loads the database connection to the meta DB.
   * 
   * It will assure that all needed tables were created.
   */
  private async metaDB(): Promise<sql3.Database> {
    return await this.loadDB('_metaDB', createMetaDB)
  }

  /**
   * Lazy loads the database connection to the data domain.
   * 
   * It may create the schema and populate the data domain with the example data domain if the
   * `CREATE_EXAMPLE_DATA_DOMAIN` env var is set to `TRUE`.
   */
  private async domainDB(): Promise<sql3.Database> {
    return this.loadDB('_domainDB', process.env.CREATE_EXAMPLE_DATA_DOMAIN === 'TRUE' ? populateDB : null)
  }

  /**
   * Lazy loads a database.
   * Optionally it can create the database schema / populate initial data on first load.
   */
  private async loadDB(
    cacheField: string,
    createFn: ((db: sql3.Database) => Promise<void>) | null
  ): Promise<sql3.Database> {
    const get = () => (this as any)[cacheField]
    const set = (value: sql3.Database) => (this as any)[cacheField] = value

    let db
    if (db = get()) return db
    db = await (async () => {
      const db = await sql3.Database.connect(':memory:')
      if (createFn) await createFn(db)
      return db
    })()
    set(db)

    return db
  }

  private async mappedEntityTypes(): Promise<EntityMeta[]> {
    const metaDB = await this.metaDB()

    // Read `entityType` table
    const entityTypes: EntityMeta[] = (
      await metaDB.all('SELECT * FROM entityType')
    ).map((et: any) => ({
      id: et.id,
      name: et.name,
      code: et.code,
      titleFormat: {
        title: et.titleFormatTitle,
        subtitle: et.titleFormatSubtitle,
      },
      fields: {}
    }))

    // TODO WIP Parallelize fields processing
    // Read `fieldType` table for each entity type
    for (const entityType of entityTypes) {
      const fields = await metaDB.all('SELECT * FROM fieldType WHERE entityTypeId = ?', [entityType.id])
      for (const f of fields as any[]) {
        entityType.fields[f.name] = {
          id: f.id,
          name: f.name,
          code: f.code,
          placeholder: f.placeholder,
          type: f.type,
          identifier: f.identifier,
          hidden: f.hidden
        }
      }
    }

    return entityTypes
  }

  private async unmappedTables(entityTypes: EntityMeta[]): Promise<string[]> {
    // Check entityTypes completion
    const domainDB = await this.domainDB()
    const allTables = await domainDB.listAllTables()
    const mappedTables = entityTypes.map(x => x.code)
    const systemTables = ['sqlite_sequence']
    const unmappedTables = allTables
      .filter(x => !mappedTables.includes(x))
      .filter(x => !systemTables.includes(x))

    return unmappedTables
  }
}

async function createMetaDB(db: sql3.Database) {
  const tables = await db.listAllTables()
  const setupTable = async (name: string, createFN: (db: sql3.Database) => Promise<void>) => {
    if (tables.includes(name)) return
    await createFN(db)
    log(`MetaDB table created: ${name}`)
  }

  await setupTable('entityType', createEntityTypeTable)
  await setupTable('fieldType', createFieldTypeTable)
}

async function createEntityTypeTable(db: sql3.Database): Promise<void> {
  // TODO Introduce UUID field to prevent leaking db schema size?
  await db.run(`
    CREATE TABLE entityType (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      code TEXT,
      titleFormatTitle TEXT,
      titleFormatSubtitle TEXT
    )
  `)
}

async function createFieldTypeTable(db: sql3.Database): Promise<void> {
  // TODO Introduce UUID field to prevent leaking db schema size?
  await db.run(`
    CREATE TABLE fieldType (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entityTypeId INTEGER,
      name TEXT,
      code TEXT,
      placeholder TEXT,
      type TEXT,
      identifier INTEGER(1),
      hidden INTEGER(1),
      FOREIGN KEY(entityTypeId) REFERENCES entityType(id)
    )
  `)
}

const SQLITE_TYPES_TO_FIELDTYPES = new Map([
  ['INTEGER', FieldType.NUMBER],
  ['TEXT', FieldType.STRING],
])

function sqliteTypeToFieldType(sqliteType: string): FieldType {
  const fieldType = SQLITE_TYPES_TO_FIELDTYPES.get(sqliteType)
  if (!fieldType) throw new Error(`Unsupported SQLite field type: ${sqliteType}`)
  return fieldType
}
