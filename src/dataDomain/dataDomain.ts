import { log } from 'console'

import { Database } from '../db/sqlite3.promises'
import { toCapitalizedSpaced, trimMargin } from '../jsext/strings'
import { Delete, Insert, Select, Update } from '../db/sql'

export type EntityMeta = {
  id: number,
  name: string,
  code: string,
  table: string,
  titleFormat: { title: string, subtitle: string },
  fields: FieldMeta[],
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
  mandatory: boolean,
  generated: boolean,
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

  async create(entityTypeCode: string, data: any): Promise<any> {
    const et = await this.entityType(entityTypeCode)

    const allowed = et.fields.map(f => f.code)
    const unknown = Object.keys(data).filter(f => !allowed.includes(f))
    if (unknown.length) throw new Error(
      `Unknown fields provided: ${unknown.map(f => `\`${f}\``).join(', ')}.`
    )

    const insert = new Insert().into(et.table)
    for (const field of et.fields) {
      const value = data[field.code]
      if (field.mandatory && (value === undefined || value === null)) {
        throw new Error(`Mandatory field \`${field.code}\` not provided.`)
      }
      insert.set(field.column, value)
    }
    const { lastID } = await insert.execute(this.domainDB)

    // Fill in generated field
    const generatedField = et.fields.find(f => f.generated)
    if (lastID && generatedField) data = {
      ...data,
      [generatedField.code]: lastID,
    }

    return data
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
      for (const f of et.fields.filter(f => f.identifier)) {
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

    for (const id of et.fields.filter(f => f.identifier)) {
      update.where.equal(id.column, data[id.code], { acceptNull: false })
    }

    const fieldsToUpdate = et.fields
      .filter(ft => !ft.identifier) // Don't update identifiers
      .filter(f => data[f.code] !== undefined) // Accept null values

    for (const f of fieldsToUpdate) {
      update.attrib.set(f.column, data[f.code])
    }

    const result = await update.execute(this.domainDB)
    if (result.changes !== 1) throw new Error(
      'Update expected to change a single entity ' +
      `but it changed ${result.changes}.`
    )

    const entities = await this.read(entityTypeCode, { ids: data })
    if (entities.length !== 1) throw new Error(
      'Expected reading the entity just updated to return a single entity ' +
      `but ${entities.length} were returned instead.`,
    )
    return entities[0]
  }

  /**
   * Deletes an entity.
   * The provided `ids` must uniquely identify a single entity and cover all
   * identifier fields defined in the entity type. Any non-id field provided
   * will be ignored.
   */
  async delete(entityTypeCode: string, ids: any) {
    const et = await this.entityType(entityTypeCode)

    const del = new Delete().table(et.table)

    for (const id of et.fields.filter(f => f.identifier)) {
      del.where.equal(id.column, ids[id.code], { acceptNull: false })
    }

    const result = await del.execute(this.domainDB)
    if (result.changes !== 1) throw new Error(
      'Delete expected to change a single entity ' +
      `ubt it deleted ${result.changes}.`
    )
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
        fields: [],
      } as any

      const [fieldExamples] = await (
        new Select().from(table).limit(1).query(this.domainDB)
      )

      const fields = await this.domainDB.all(
        'SELECT * FROM PRAGMA_TABLE_INFO(?)', [table],
      )
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
          mandatory: f.notnull === 1,
          generated: false,
        } as any
        et.fields.push(ft)
      }

      // generated (AUTOINCREMENT)
      const ids = et.fields.filter(f => f.identifier)
      if (
        ids.length === 1 && ids[0].type === FieldType.NUMBER
      ) ids[0].generated = true

      // titleFormat
      const formatFirstNFields = (
        numberOfFields: number,
      ) => et.fields
        .filter(x => !x.hidden)
        .slice(0, numberOfFields)
        .map(x => `#{${x.code}}`).join(' ')
      et.titleFormat = {
        title: formatFirstNFields(2),
        subtitle: formatFirstNFields(3),
      }

      // Save to the `entityType` table
      const { lastID: entityID } = await new Insert()
        .into('entityType')
        .set('name', et.name)
        .set('code', et.code)
        .set('table', et.table)
        .set('titleFormatTitle', et.titleFormat.title)
        .set('titleFormatSubtitle', et.titleFormat.subtitle)
        .execute(this.metaDB)
      et.id = entityID

      // Save to the `fieldTypes` table
      for (const f of Object.values(et.fields)) {
        const { lastID: fieldID } = await new Insert().into('fieldType')
          .set('entityTypeId', et.id)
          .set('name', f.name)
          .set('code', f.code)
          .set('column', f.column)
          .set('placeholder', f.placeholder)
          .set('type', f.type)
          .set('identifier', f.identifier)
          .set('hidden', f.hidden)
          .set('mandatory', f.mandatory)
          .set('generated', f.generated)
          .execute(this.metaDB)
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
      fields: [],
    }))

    // Read fields for each entity type
    await Promise.all(entityTypes.map(async et => {
      const select = new Select().from('fieldType')
      select.where.equal('entityTypeId', et.id)
      const fields = await select.query(this.metaDB)
      for (const f of fields) {
        et.fields.push({
          id: f.id,
          name: f.name,
          code: f.code,
          column: f.column,
          placeholder: f.placeholder,
          type: f.type,
          identifier: f.identifier,
          hidden: f.hidden,
          mandatory: f.mandatory,
          generated: false,
        })
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
    |  mandatory INTEGER(1),
    |  generated INTEGER(1),
    |  FOREIGN KEY(entityTypeId) REFERENCES entityType(id),
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
