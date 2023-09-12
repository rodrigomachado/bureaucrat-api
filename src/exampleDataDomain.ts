import { log } from 'console'
import * as sql3 from './db/sqlite3.promises'

/**
 * Creates and populates the Authorization Data Domain example database.
 * It only creates and populates tables if they're absent.
 */
export async function populateDB(db: sql3.Database): Promise<void> {
  if (process.env.CREATE_EXAMPLE_DATA_DOMAIN !== 'TRUE') return

  const tables = await db.listAllTables()
  const createTable = async (name: string, fn: (db: sql3.Database) => Promise<void>) => {
    if (tables.includes(name)) return
    await fn(db)
    log(`Example Data Domain table created: ${name}`)
  }

  await createTable('users', createUsers)
  await createTable('features', createFeatures)

  log(`Tables: ${await db.listAllTables()}`)
}

async function createUsers(db: sql3.Database): Promise<void> {
  await db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      birth_date TEXT
    )
  `)

  const addUser = async (
    firstName: string, middleName: string, lastName: string, birthDate: string
  ) => (
    await db.run(`
      INSERT INTO users (first_name, middle_name, last_name, birth_date)
      VALUES (?, ?, ?, ?)
    `, [firstName, middleName, lastName, birthDate])
  )
  await addUser('Douglas', 'Noël', 'Adams', '1767-07-11')
  await addUser('John', 'Marwood', 'Cleese', '1939-10-27')
  await addUser('Rowan', 'Sebastian', 'Atkinson', '1955-01-06')
  await addUser('Isaac', '', 'Asimov', '1920-01-02')
  await addUser('Mary', 'Wollstonecraft', 'Shelley', '1797-08-30')
}

async function createFeatures(db: sql3.Database): Promise<void> {
  await db.run(`
    CREATE TABLE features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      path TEXT
    )
  `)

  const addFeature = async (name: string, path: string) => (
    await db.run(`
      INSERT INTO features (name, path)
      VALUES (?,?)
    `, [name, path])
  )
  await addFeature('CreateUser', 'user')
  await addFeature('ReadUser', 'user')
  await addFeature('UpdateUser', 'user')
  await addFeature('DeleteUser', 'user')
}
