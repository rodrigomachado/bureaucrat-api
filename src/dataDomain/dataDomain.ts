import { log } from 'console'

import { Database } from '../db/sqlite3.promises'
import {
  toCapitalizedSpaced, trimMargin, pluralize,
} from '../jsext/strings'

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
  private metaDB: Database
  private domainDB: Database
  private _entityTypes: Promise<EntityMeta[]> | undefined // Entity Types cache

  constructor(metaDB: Database, domainDB: Database) {
    this.metaDB = metaDB
    this.domainDB = domainDB
  }

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
   * @param ids The identifiers of a **single** entity.
   * @param limit The maximum number of entities to be returned.
   */
  async read(
    entityTypeCode: string, { ids, limit }: ReadOptions = {},
  ): Promise<any[]> {
    const et = await this.entityType(entityTypeCode)

    const params: any[] = []
    let sql = `SELECT * FROM ${et.table}`
    if (ids) {
      const idsMeta = Object.values(et.fields).filter(f => f.identifier)
      const idsMetaL = idsMeta.length
      const idDataL = ids.length
      if (idsMetaL !== idDataL) {
        throw new Error(
          `Invalid IDs provided (length: ${idDataL}). ` +
          `Expected ${idsMetaL} ${pluralize(idsMeta, 'id', 'ids')}: ` +
          `${idsMeta.map(f => `'${f.code}'`).join(', ')}`
        )
      }
      sql += ' WHERE ' + idsMeta.map(f => `${f.column} = ?`).join(' AND ')
      params.push(...ids)
    }
    if (limit) sql += ` LIMIT ${limit}`

    const raw = await this.domainDB.all(sql, params)

    const entities: any[] = []
    for (const r of raw) {
      entities.push(Object.values(et.fields).reduce((acc, f) => {
        acc[f.code] = r[f.column]
        return acc
      }, {} as any))
    }

    return entities
  }

  async update(entityTypeCode: string, data: any) {
    // TODO Resolve duplication on `DataSource.read(…)` and `…update(…)`.
    // Ex: idData evaluation
    const et = await this.entityType(entityTypeCode)

    const ids = Object.values(et.fields)
      .filter(ft => ft.identifier)
      .map(ft => ({
        code: ft.code,
        column: ft.column,
        value: data[ft.code],
      }))
    ids.forEach(({ code, value }) => {
      if (value !== null && value !== undefined) return
      throw new Error(
        `The data provided does not define the identifier '${code}'`,
      )
    })
    if (!ids.length) throw new Error(
      'Unable to uniquely identify an entity: it has no identifier fields',
    )

    const fieldsToUpdate = Object
      .values(et.fields)
      .filter(ft => !ft.identifier)
      .map(ft => ({
        column: ft.column,
        value: data[ft.code],
      }))
      // Null values should still be updated
      .filter(({ value }) => value !== undefined)

    const setClause = '\nSET ' +
      fieldsToUpdate.map(({ column }) => `${column} = ?`).join(', ')
    const whereClause = '\nWHERE ' +
      ids.map(({ column }) => `${column} = ?`).join(' AND ')
    const sql = `UPDATE ${et.table}` + setClause + whereClause
    const params = [
      ...fieldsToUpdate.map(({ value }) => value),
      ...ids.map(({ value }) => value),
    ]

    const result = await this.domainDB.run(sql, params)
    if (result.changes !== 1) throw new Error(
      'Data update expected to change a single value ' +
      `but it changed ${result.changes}`
    )

    const entities = await this.read(entityTypeCode, {
      ids: Object.values(et.fields)
        .filter(f => f.identifier).map(f => data[f.code]),
    })
    if (entities.length !== 1) throw new Error(
      'Expected reading the entity just updated to return a single entity ' +
      `but ${entities.length} were returned instead.`,
    )
    return entities[0]
  }

  /**
   * Inspects the domain database for clues of the data domain model and infers
   * its metadata.
   */
  private async introspect(unmappedTables: string[]): Promise<EntityMeta[]> {
    return await Promise.all(unmappedTables.map((async table => {
      const et: EntityMeta = {
        name: toCapitalizedSpaced(table),
        code: table,
        table,
        fields: {},
      } as any

      const [fieldExamples] = await this.domainDB.all(
        `SELECT * FROM ${table} LIMIT 1`,
      )

      const fields = await this.domainDB.all(
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

      // Save to the `entityType` table
      const { lastID: entityID } = await this.metaDB.run(trimMargin`
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
        const { lastID: fieldID } = await this.metaDB.run(trimMargin`
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

  private async mappedEntityTypes(): Promise<EntityMeta[]> {
    // Read `entityType` table
    const entityTypes: EntityMeta[] = (
      await this.metaDB.all('SELECT * FROM entityType')
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
      const fields = await this.metaDB.all(
        'SELECT * FROM fieldType WHERE entityTypeId = ?', [et.id],
      )
      for (const f of fields) {
        et.fields[f.code] = {
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
    const allTables = await this.domainDB.listAllTables()
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


export async function createMetaDB(db: Database) {
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
  await db.run(trimMargin`
    |CREATE TABLE entityType (
    |  id INTEGER PRIMARY KEY AUTOINCREMENT,
    |  code TEXT UNIQUE,
    |  name TEXT,
    |  'table' TEXT,
    |  titleFormatTitle TEXT,
    |  titleFormatSubtitle TEXT
    |)
  `)
}

async function createFieldTypeTable(db: Database): Promise<void> {
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
    |  UNIQUE(entityTypeId,code)
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
