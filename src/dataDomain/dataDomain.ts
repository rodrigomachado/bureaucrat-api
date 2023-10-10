import { log } from 'console'

import { Database } from '../db/sqlite3.promises'
import { toCapitalizedSpaced, trimMargin } from '../jsext/strings'
import { Select, Update } from '../db/sql'

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
   * @param opts.ids An object with the identifiers of a **single** entity. 
   *   It may contain other fields for convenience.
   * @param opts.limit The maximum number of entities to be returned.
   */
  async read(
    entityTypeCode: string, { ids, limit }: ReadOptions = {},
  ): Promise<any[]> {
    const et = await this.entityType(entityTypeCode)

    const select = new Select().from(et.table)
    if (ids) {
      // TODO WIP extract field utilities to `EntityMeta`
      for (const f of Object.values(et.fields).filter(f => f.identifier)) {
        if (ids[f.code] === undefined) throw new Error(
          `Field '${f.code}' expected but not found in the 'ids' provided.`
        )
        select.where.equal(f.column, ids[f.code])
      }
    }
    if (limit) select.limit(limit)

    const raw = await select.query(this.domainDB)
    return raw.map(r => {
      return Object.values(et.fields).reduce((acc, f) => {
        acc[f.code] = r[f.column]
        return acc
      }, {} as any)
    })
  }

  /**
   * Updates an entity.
   * The provided data must define the ids to the target entity and one or more
   * non-id fields to be updated.
   */
  async update(entityTypeCode: string, data: any) {
    const et = await this.entityType(entityTypeCode)

    const update = new Update().table(et.table)

    for (const id of Object.values(et.fields).filter(f => f.identifier)) {
      update.where.equal(id.column, data[id.code], { acceptNull: false })
    }

    const fieldsToUpdate = Object.values(et.fields)
      .filter(ft => !ft.identifier) // Don't update identifiers
      .filter(f => data[f.code] !== undefined) // Accept null values

    for (const f of fieldsToUpdate) {
      update.attrib.set(f.column, data[f.code])
    }

    const result = await update.execute(this.domainDB)
    if (result.changes !== 1) throw new Error(
      'Data update expected to change a single value ' +
      `but it changed ${result.changes}`
    )

    const entities = await this.read(entityTypeCode, { ids: data })
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

      const [fieldExamples] = await (
        new Select().from(table).limit(1).query(this.domainDB)
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
      // TODO WIP Craft and use `InsertBuilder`
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
      await new Select().from('entityType').query(this.metaDB)
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
      const select = new Select().from('fieldType')
      select.where.equal('entityTypeId', et.id)
      const fields = await select.query(this.metaDB)
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
  ids?: { [fCode: string]: any },
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
  // TODO WIP Craft and use `CreateTableBuilder`?
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
