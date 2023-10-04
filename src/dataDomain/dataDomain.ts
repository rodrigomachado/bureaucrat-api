import { log } from 'console'

import { DataSource } from './dataSourceSQL'
import { Database } from '../db/sqlite3.promises'
import { populateDB } from '../exampleDataDomain'
import { toCapitalizedSpaced, trimMargin } from '../jsext/strings'

export type EntityMeta = {
  id: number,
  name: string,
  code: string,
  table: string,
  titleFormat: { title: string, subtitle: string },
  fields: {
    [name: string]: FieldMeta,
  },
}

export type FieldMeta = {
  id: number,
  name: string,
  code: string,
  column: string,
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
 * The Data Domain is able to inspect a given SQL database looking for entities
 * to be managed by Bureaucrat.
 * To avoid unnecessary reruns of the costly inspection and allow for user
 * overrides, the Data Domain model is persisted to a separate database upon
 * first inspection.
 */
export class DataDomain {
  private _entityTypes: Promise<EntityMeta[]> | undefined // Entity Types cache

  /**
   * Returns all the entity types in the data domain.
   * It will first try to load the entity types from the metDB and, in case it
   * doesn't cover all tables in the domainDB, it will introspect them and infer
   * entity types.
   */
  async entityTypes(): Promise<EntityMeta[]> {
    // TODO Invalidate entity types cache eventually
    if (this._entityTypes) return this._entityTypes
    return this._entityTypes = (async () => {
      const entityTypes = await this.mappedEntityTypes()
      const unmappedTables = await this.unmappedTables(entityTypes)
      if (!unmappedTables.length)
        // No tables left to inspect
        return entityTypes

      return entityTypes.concat(
        await this.introspect(unmappedTables)// Inspect missing tables
      )
    })()
  }

  async entityType(code: string): Promise<EntityMeta> {
    const entityTypes = await this.entityTypes()
    const [entityType] = entityTypes.filter(et => et.code === code)
    if (!entityType) throw new Error(`No entity type found for code '${code}'`)
    return entityType
  }

  /**
   * Reads all entries for a particular entity type.
   */
  async read(
    entityTypeCode: string, { ids, limit }: ReadOptions = {},
  ): Promise<any[]> {
    const ds = DataSource.read(
      await this.domainDB(),
      await this.entityType(entityTypeCode),
    )
    if (ids) ds.ids(ids)
    if (limit) ds.limit(limit)
    return await ds.all()
  }

  async update(entityTypeCode: string, data: any) {
    // TODO Resolve duplication on `DataSource.read(…)` and `…update(…)`.
    // Ex: idData evaluation
    const et = await this.entityType(entityTypeCode)

    const db = DataSource.update(await this.domainDB(), et)
    db.data(data)
    await db.execute()

    const idData = Object.values(et.fields)
      .filter(f => f.identifier).map(f => data[f.code])
    const entities = await DataSource.read(
      await this.domainDB(), et,
    ).ids(idData).all()
    return entities[0]
  }

  /**
   * Inspects the domain database for clues of the data domain model and infers
   * its metadata.
   */
  private async introspect(unmappedTables: string[]): Promise<EntityMeta[]> {
    // TODO Also use domainDB data, along with metadata tables, to infer
    // metadata

    const domainDB = await this.domainDB()

    return await Promise.all(unmappedTables.map((async table => {
      const et: EntityMeta = {
        name: toCapitalizedSpaced(table),
        code: table,
        table,
        fields: {},
      } as any

      const [fieldExamples] = await domainDB.all(
        `SELECT * FROM ${table} LIMIT 1`,
      )

      const fields = await domainDB.all(
        'SELECT * FROM PRAGMA_TABLE_INFO(?)', [table],
      )
      // TODO Validate `fields` shape?
      for (const f of fields) {
        const isID = f.pk === 1
        const column = f.name
        const ft: FieldMeta = {
          name: toCapitalizedSpaced(column),
          code: column,
          column,
          placeholder: (
            isID ? null : fieldExamples && fieldExamples[column] || null
          ),
          type: sqliteTypeToFieldType(f.type),
          identifier: isID,
          hidden: isID,
        } as any
        et.fields[ft.code] = ft
      }

      const formatFirstNFields = (
        numberOfFields: number,
      ) => Object.values(et.fields!)
        .filter(x => !x.hidden)
        .slice(0, numberOfFields)
        .map(x => `#{${x.code}}`).join(' ')
      et.titleFormat = {
        title: formatFirstNFields(2),
        subtitle: formatFirstNFields(3),
      }

      const metaDB = await this.metaDB()

      // Save to the `entityType` table
      const { lastID: entityID } = await metaDB.run(trimMargin`
        |INSERT INTO entityType(
        |  name,code,'table',titleFormatTitle,titleFormatSubtitle
        |)
        |VALUES (?,?,?,?,?)
      `, [
        et.name, et.code, et.table,
        et.titleFormat.title, et.titleFormat.subtitle,
      ])
      et.id = entityID

      // Save to the `fieldTypes` table
      for (const f of Object.values(et.fields)) {
        const { lastID: fieldID } = await metaDB.run(trimMargin`
          |INSERT INTO fieldType(
          |  entityTypeId,name,code,column,placeholder,type,identifier,hidden
          |)
          |VALUES (?,?,?,?,?,?,?,?)
        `, [
          et.id, f.name, f.code, f.column,
          f.placeholder, f.type, f.identifier, f.hidden,
        ])
        f.id = fieldID
      }

      return et
    })))
  }

  /**
   * Lazy loads the database connection to the meta DB.
   * 
   * It will assure that all needed tables were created.
   */
  private async metaDB(): Promise<Database> {
    return await this.loadDB('_metaDB', createMetaDB)
  }

  /**
   * Lazy loads the database connection to the data domain.
   * 
   * It may create the schema and populate the data domain with the example data
   * domain if the `CREATE_EXAMPLE_DATA_DOMAIN` env var is set to `TRUE`.
   */
  private async domainDB(): Promise<Database> {
    return this.loadDB(
      '_domainDB',
      process.env.CREATE_EXAMPLE_DATA_DOMAIN === 'TRUE' ? populateDB : null,
    )
  }

  /**
   * Lazy loads a database.
   * Optionally it can create the database schema / populate initial data on
   * first load.
   */
  private async loadDB(
    cacheField: string,
    createFn: ((db: Database) => Promise<void>) | null
  ): Promise<Database> {
    const get = (): Promise<Database> | null => (this as any)[cacheField]
    const set = (value: Promise<Database>) => (this as any)[cacheField] = value

    let db = get()
    if (db) return db
    db = (async () => {
      const db = await Database.connect(':memory:')
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
      table: et.table,
      titleFormat: {
        title: et.titleFormatTitle,
        subtitle: et.titleFormatSubtitle,
      },
      fields: {},
    }))

    // Read fields for each entity type
    await Promise.all(entityTypes.map(async et => {
      const fields = await metaDB.all(
        'SELECT * FROM fieldType WHERE entityTypeId = ?', [et.id],
      )
      for (const f of fields) {
        et.fields[f.name] = {
          id: f.id,
          name: f.name,
          code: f.code,
          column: f.column,
          placeholder: f.placeholder,
          type: f.type,
          identifier: f.identifier,
          hidden: f.hidden,
        }
      }
    }))

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

type ReadOptions = {
  ids?: any[],
  limit?: number,
}


async function createMetaDB(db: Database) {
  const tables = await db.listAllTables()
  const setupTable = async (
    name: string, createFN: (db: Database) => Promise<void>,
  ) => {
    if (tables.includes(name)) return
    await createFN(db)
    log(`MetaDB table created: ${name}`)
  }

  await setupTable('entityType', createEntityTypeTable)
  await setupTable('fieldType', createFieldTypeTable)
}

async function createEntityTypeTable(db: Database): Promise<void> {
  // TODO Introduce UUID field to prevent leaking db schema size?
  await db.run(trimMargin`
    |CREATE TABLE entityType (
    |  id INTEGER PRIMARY KEY AUTOINCREMENT,
    |  name TEXT,
    |  code TEXT,
    |  'table' TEXT,
    |  titleFormatTitle TEXT,
    |  titleFormatSubtitle TEXT
    |)
  `)
}

async function createFieldTypeTable(db: Database): Promise<void> {
  // TODO Introduce UUID field to prevent leaking db schema size?
  await db.run(trimMargin`
    |CREATE TABLE fieldType (
    |  id INTEGER PRIMARY KEY AUTOINCREMENT,
    |  entityTypeId INTEGER,
    |  name TEXT,
    |  code TEXT,
    |  column TEXT,
    |  placeholder TEXT,
    |  type TEXT,
    |  identifier INTEGER(1),
    |  hidden INTEGER(1),
    |  FOREIGN KEY(entityTypeId) REFERENCES entityType(id)
    |)
  `)
}

const SQLITE_TYPES_TO_FIELDTYPES = new Map([
  ['INTEGER', FieldType.NUMBER],
  ['TEXT', FieldType.STRING],
])

function sqliteTypeToFieldType(sqliteType: string): FieldType {
  const fieldType = SQLITE_TYPES_TO_FIELDTYPES.get(sqliteType)
  if (!fieldType) throw new Error(
    `Unsupported SQLite field type: ${sqliteType}`,
  )
  return fieldType
}
